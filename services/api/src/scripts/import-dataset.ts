/**
 * Bulk-imports an open recipe dataset from a local file.
 *
 *   pnpm --filter @petra/api run db:import-dataset -- ./data/recipes.jsonl
 *   pnpm --filter @petra/api run db:import-dataset -- ./data/recipes.csv --limit 50000
 *
 * Sits alongside `import-recipes.ts`, which pulls a few hundred photographed
 * recipes from TheMealDB over HTTP. This one is for the other shape of the
 * problem: a downloaded open corpus of tens or hundreds of thousands of rows,
 * read from disk, streamed rather than buffered.
 *
 * THE TRADE, stated plainly because it is the reason this is a separate script
 * and not the default: open corpora bring scale and almost no photography. This
 * app is image-led — the recipe cards, the meal plan, the discovery screen are
 * all built around a photograph — so importing 200k image-less recipes makes
 * the library larger and the product worse unless the surfaces that need an
 * image prefer rows that have one. `--require-image` exists for that, and is
 * the flag to reach for first.
 *
 * PREREQUISITE: retrieval must already be reading from the database rather than
 * from an in-process index (the pgvector migration). Before that change, an
 * import of this size loaded the entire corpus into the agent's memory on the
 * first chat turn after it ran.
 *
 * Idempotent on `source`, exactly like the TheMealDB importer, so a re-run
 * updates in place rather than duplicating. Nothing here invents timings or
 * nutrition: unknown values land as 0 and null, which the app renders as
 * "unknown" rather than as a confident wrong number. The enrichment pass fills
 * them for the recipes the app actually surfaces.
 *
 * After importing, build the vectors:
 *
 *   pnpm --filter @petra/agent run embed
 *
 * That is the long pole — read its sizing note before starting a large run.
 */

import { createReadStream } from 'node:fs';
import { basename } from 'node:path';
import { createInterface } from 'node:readline';

import { Difficulty, PrismaClient } from '@prisma/client';
import { parseMeasure } from '@petra/food-measures';

const prisma = new PrismaClient();

/* --------------------------------------------------------------- arguments */

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('-'));

const flag = (name: string): boolean => args.includes(`--${name}`);
const value = (name: string): number | undefined => {
  const at = args.indexOf(`--${name}`);
  if (at === -1) return undefined;
  const parsed = Number(args[at + 1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const LIMIT = value('limit');
const REQUIRE_IMAGE = flag('require-image');
const DRY_RUN = flag('dry-run');
/** Defaults to the file name, so two datasets cannot collide on `source`. */
const DATASET = (() => {
  const at = args.indexOf('--dataset');
  if (at !== -1 && args[at + 1]) return args[at + 1];
  return file ? basename(file).replace(/\.[^.]+$/, '') : 'dataset';
})();

/* ------------------------------------------------------------------ shapes */

/**
 * The fields this importer understands.
 *
 * Open recipe datasets disagree about almost everything, so the reader accepts
 * a handful of spellings per field rather than demanding one schema. Anything
 * it cannot find is absent, not guessed.
 */
interface RawRecipe {
  id?: string | number;
  title?: string;
  name?: string;
  description?: string;
  image?: string;
  image_url?: string;
  thumbnail?: string;
  servings?: number | string;
  yield?: number | string;
  cuisine?: string;
  category?: string;
  course?: string;
  tags?: string[] | string;
  keywords?: string[] | string;
  /** Either a list of strings, or a list of objects with a name and a measure. */
  ingredients?: unknown;
  /** Either a list of steps or one blob. */
  instructions?: unknown;
  directions?: unknown;
  steps?: unknown;
  prep_time?: number | string;
  cook_time?: number | string;
  total_time?: number | string;
  [key: string]: unknown;
}

const firstString = (...values: unknown[]): string | null => {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.match(/\d+(?:\.\d+)?/);
    if (match) return Number(match[0]);
  }
  return null;
};

const asList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map(v => (typeof v === 'string' ? v : typeof v === 'object' && v ? JSON.stringify(v) : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    // Some datasets ship a Python-repr list in a CSV cell.
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed.replace(/'/g, '"'));
        if (Array.isArray(parsed)) return parsed.filter(x => typeof x === 'string');
      } catch {
        // Fall through to splitting.
      }
    }
    return trimmed.split(/\r?\n|\|/).map(s => s.trim()).filter(Boolean);
  }
  return [];
};

/**
 * Split an ingredient line into a measure and a name.
 *
 * `parseMeasure` reads the leading quantity; whatever it leaves is the name.
 * Getting this right is what makes the nutrition node work on imported
 * recipes — an ingredient with no readable amount can be listed but not
 * counted.
 */
function parseIngredientLine(line: string, order: number) {
  const text = line.replace(/\s+/g, ' ').trim();
  if (!text) return null;

  // Everything up to the first letter-initial word is the measure.
  const split = text.match(/^([\d\s./½⅓⅔¼¾⅕⅙⅛⅜⅝⅞]*\s*[a-z]*\.?\s*)(.*)$/i);
  const measure = split?.[1]?.trim() ?? '';
  const remainder = split?.[2]?.trim() ?? text;

  const parsed = parseMeasure(measure);
  const name = (parsed.unit || parsed.quantified ? remainder : text).replace(/^of\s+/i, '').trim();

  if (name.length < 2 || name.length > 200) return null;

  return {
    name,
    amount: parsed.amount,
    unit: parsed.unit,
    notes: parsed.notes ?? null,
    order,
  };
}

/** Object-shaped ingredients, which some datasets use. */
function parseIngredientObject(raw: unknown, order: number) {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  const name = firstString(o.name, o.ingredient, o.item, o.food);
  if (!name) return null;

  const measure = firstString(o.measure, o.quantity, o.amount, o.unit) ?? '';
  const parsed = parseMeasure(measure);

  return {
    name,
    amount: asNumber(o.amount) ?? parsed.amount,
    unit: firstString(o.unit) ?? parsed.unit,
    notes: parsed.notes ?? null,
    order,
  };
}

function inferDifficulty(ingredientCount: number, stepCount: number): Difficulty {
  const weight = ingredientCount + stepCount;
  if (weight <= 10) return Difficulty.EASY;
  if (weight <= 18) return Difficulty.MEDIUM;
  return Difficulty.HARD;
}

/* ------------------------------------------------------------- normalising */

interface Normalised {
  source: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  servings: number;
  prepTime: number;
  cookTime: number;
  totalTime: number;
  difficulty: Difficulty;
  cuisine: string | null;
  mealCategory: string | null;
  dietaryTags: string[];
  ingredients: { name: string; amount: number; unit: string; notes: string | null; order: number }[];
  steps: string[];
}

export function normalise(raw: RawRecipe, dataset: string, index: number): Normalised | null {
  const title = firstString(raw.title, raw.name);
  if (!title || title.length > 300) return null;

  const rawIngredients = Array.isArray(raw.ingredients) ? raw.ingredients : asList(raw.ingredients);
  const ingredients = rawIngredients
    .map((entry, i) =>
      typeof entry === 'string'
        ? parseIngredientLine(entry, i + 1)
        : parseIngredientObject(entry, i + 1)
    )
    .filter((x): x is NonNullable<typeof x> => x !== null)
    // A row with forty "ingredients" is a parse failure, not a recipe.
    .slice(0, 40);

  const steps = asList(raw.instructions ?? raw.directions ?? raw.steps)
    .map(s => s.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(s => s.length > 5)
    .slice(0, 40);

  // Both are non-negotiable: a recipe without ingredients cannot be cooked, and
  // one without a method cannot be followed. Importing either would pad a
  // count and hurt every surface that shows it.
  if (ingredients.length < 2 || steps.length < 1) return null;

  const prepTime = asNumber(raw.prep_time) ?? 0;
  const cookTime = asNumber(raw.cook_time) ?? 0;
  const totalTime = asNumber(raw.total_time) ?? prepTime + cookTime;

  const tags = [...asList(raw.tags), ...asList(raw.keywords)]
    .map(t => t.toLowerCase().trim())
    .filter(t => t.length > 1 && t.length < 40);

  return {
    // Keyed on the dataset's own id where it has one, and on the row's position
    // otherwise, so a re-run updates rather than duplicating either way.
    source: `${dataset}:${raw.id ?? index}`,
    title,
    description: firstString(raw.description),
    imageUrl: firstString(raw.image, raw.image_url, raw.thumbnail),
    servings: Math.min(Math.max(Math.round(asNumber(raw.servings ?? raw.yield) ?? 4), 1), 24),
    prepTime: Math.min(Math.round(prepTime), 480),
    cookTime: Math.min(Math.round(cookTime), 1440),
    totalTime: Math.min(Math.round(totalTime), 1440),
    difficulty: inferDifficulty(ingredients.length, steps.length),
    cuisine: firstString(raw.cuisine),
    mealCategory: firstString(raw.category, raw.course),
    dietaryTags: [...new Set(tags)].slice(0, 12),
    ingredients,
    steps,
  };
}

/* ---------------------------------------------------------------- writing */

type Outcome = 'created' | 'updated' | 'skipped';

async function persist(recipe: Normalised): Promise<Outcome> {
  const existing = await prisma.recipe.findFirst({
    where: { source: recipe.source },
    select: { id: true, safetyNote: true },
  });

  const { ingredients, steps, ...fields } = recipe;

  if (existing) {
    // Never clobber the enrichment pass, for the same reason the TheMealDB
    // importer doesn't: timings and difficulty are guesses here and real
    // estimates once enriched.
    const { prepTime, cookTime, totalTime, difficulty, ...importOwned } = fields;
    await prisma.recipe.update({
      where: { id: existing.id },
      data:
        existing.safetyNote !== null
          ? importOwned
          : { ...importOwned, prepTime, cookTime, totalTime, difficulty },
    });

    await prisma.recipeIngredient.deleteMany({ where: { recipeId: existing.id } });
    await prisma.recipeInstruction.deleteMany({ where: { recipeId: existing.id } });
    await prisma.recipeIngredient.createMany({
      data: ingredients.map(i => ({ ...i, recipeId: existing.id })),
    });
    await prisma.recipeInstruction.createMany({
      data: steps.map((instruction, i) => ({ recipeId: existing.id, step: i + 1, instruction })),
    });
    return 'updated';
  }

  await prisma.recipe.create({
    data: {
      ...fields,
      isAIGenerated: false,
      isPublic: true,
      ingredients: { create: ingredients },
      instructions: { create: steps.map((instruction, i) => ({ step: i + 1, instruction })) },
    },
  });
  return 'created';
}

/* ------------------------------------------------------------------- main */

/**
 * Read the file line by line.
 *
 * JSONL is the expected format, and a JSON array is accepted by reading the
 * whole file — which is only safe for the smaller ones, hence the warning. A
 * streamed read is the point: a 300MB corpus should not need 300MB of heap
 * before the first row is written.
 */
async function* rows(path: string): AsyncGenerator<RawRecipe> {
  if (path.endsWith('.json')) {
    console.warn(
      '  reading a JSON array loads the whole file into memory; prefer .jsonl for large datasets'
    );
    const { readFile } = await import('node:fs/promises');
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    for (const row of Array.isArray(parsed) ? parsed : [parsed]) yield row as RawRecipe;
    return;
  }

  const reader = createInterface({
    input: createReadStream(path, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of reader) {
    const trimmed = line.trim().replace(/,$/, '');
    if (!trimmed || trimmed === '[' || trimmed === ']') continue;
    try {
      yield JSON.parse(trimmed) as RawRecipe;
    } catch {
      // One malformed line must not end an import of a hundred thousand.
      continue;
    }
  }
}

async function main() {
  if (!file) {
    console.error(
      'Usage: db:import-dataset -- <file.jsonl> [--dataset name] [--limit n] ' +
        '[--require-image] [--dry-run]'
    );
    process.exit(1);
  }

  console.log(`Importing ${file} as "${DATASET}"${DRY_RUN ? ' (dry run)' : ''}\n`);

  const tally = { created: 0, updated: 0, skipped: 0, failed: 0 };
  const seen = new Set<string>();
  const started = Date.now();
  let index = 0;

  for await (const raw of rows(file)) {
    index++;
    if (LIMIT !== undefined && tally.created + tally.updated >= LIMIT) break;

    const recipe = normalise(raw, DATASET, index);
    if (!recipe) {
      tally.skipped++;
      continue;
    }
    if (REQUIRE_IMAGE && !recipe.imageUrl) {
      tally.skipped++;
      continue;
    }
    // A dataset with duplicate ids would otherwise have its rows fight each
    // other through the idempotency key, each overwriting the last.
    if (seen.has(recipe.source)) {
      tally.skipped++;
      continue;
    }
    seen.add(recipe.source);

    if (DRY_RUN) {
      tally.created++;
      continue;
    }

    try {
      tally[await persist(recipe)]++;
    } catch (error) {
      tally.failed++;
      if (tally.failed <= 10) {
        console.warn(`  "${recipe.title}" failed — ${(error as Error).message}`);
      }
    }

    if ((tally.created + tally.updated) % 200 === 0) {
      const rate = (tally.created + tally.updated) / ((Date.now() - started) / 1000);
      process.stdout.write(
        `  ${tally.created} created, ${tally.updated} updated, ` +
          `${tally.skipped} skipped, ${rate.toFixed(0)}/s\r`
      );
    }
  }

  console.log(
    `\n  created ${tally.created}  updated ${tally.updated}  ` +
      `skipped ${tally.skipped}  failed ${tally.failed}`
  );

  if (!DRY_RUN) {
    const total = await prisma.recipe.count();
    const withImages = await prisma.recipe.count({ where: { imageUrl: { not: null } } });
    console.log(`  recipes in db: ${total} (${withImages} with photography)`);
    console.log('\n  Next: pnpm --filter @petra/agent run embed');
  }
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
