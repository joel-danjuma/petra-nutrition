/**
 * Imports a real recipe library from TheMealDB into the local database.
 *
 *   pnpm --filter @petra/backend run db:import-recipes
 *
 * Why this exists: the app shipped with 3 recipes and no photography, so
 * "Find recipes" was empty, meal cards had nothing to show, and the AI had
 * nothing to ground on. TheMealDB is free, needs no key, and — crucially —
 * carries real dish photography, which is what the mockup's image-led cards
 * were designed around.
 *
 * LICENSING: TheMealDB is free for development and education; commercial use
 * expects a supporter key. Fine for this build, but a real constraint before
 * shipping.
 *
 * What it deliberately does NOT do: invent timings or nutrition. TheMealDB
 * carries neither, so `prepTime`/`cookTime` land as 0 (the app treats 0 as
 * "unknown" and hides the chip) and nutrition is left absent. The enrichment
 * pass fills both with real estimates for the recipes the app actually
 * surfaces. Fabricating them here would put confident numbers on screen that
 * nothing stands behind.
 *
 * Idempotent: keyed on `source = themealdb:{id}`, so re-running updates in
 * place rather than duplicating.
 */

import { Difficulty, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const API = 'https://www.themealdb.com/api/json/v1/1/search.php?f=';
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

interface RawMeal {
  idMeal: string;
  strMeal: string;
  strCategory: string | null;
  strArea: string | null;
  strTags: string | null;
  strInstructions: string;
  strMealThumb: string | null;
  strSource: string | null;
  [key: string]: string | null;
}

/* ------------------------------------------------------------------ parsing */

const VULGAR: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅙': 1 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

/**
 * TheMealDB measures are free text — "800g", "1 clove", "2 tablespoons",
 * "1 small finely diced", "½ cup", "1 1/2 tbsp", "Dash". Pull out a number and
 * a unit where we can; anything left over becomes a note rather than being
 * silently dropped.
 */
export function parseMeasure(raw: string): { amount: number; unit: string; notes?: string } {
  const text = (raw || '').trim();
  if (!text) return { amount: 1, unit: '' };

  let rest = text;
  let amount = 0;
  let matched = false;

  // Leading mixed number / fraction / decimal / vulgar fraction.
  const mixed = rest.match(/^(\d+)\s+(\d+)\/(\d+)\s*/);
  const frac = rest.match(/^(\d+)\/(\d+)\s*/);
  const dec = rest.match(/^(\d+(?:\.\d+)?)\s*/);
  const vulgar = rest.match(/^([½⅓⅔¼¾⅕⅙⅛⅜⅝⅞])\s*/);

  if (mixed) {
    amount = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    rest = rest.slice(mixed[0].length);
    matched = true;
  } else if (frac) {
    amount = Number(frac[1]) / Number(frac[2]);
    rest = rest.slice(frac[0].length);
    matched = true;
  } else if (dec) {
    amount = Number(dec[1]);
    rest = rest.slice(dec[0].length);
    matched = true;
    // "800g" — unit glued to the number.
    const glued = rest.match(/^(g|kg|ml|l|oz|lb|lbs)\b/i);
    if (glued) {
      return { amount, unit: glued[1].toLowerCase() };
    }
  } else if (vulgar) {
    amount = VULGAR[vulgar[1]];
    rest = rest.slice(vulgar[0].length);
    matched = true;
  }

  if (!matched) {
    // "Dash", "To taste", "Pinch" — a qualitative measure, not a quantity.
    return { amount: 1, unit: '', notes: text };
  }

  rest = rest.trim();
  if (!rest) return { amount, unit: '' };

  // First token is the unit if it looks like one; the remainder is preparation
  // detail ("1 small finely diced" → 1, unit "", note "small finely diced").
  const UNITS = /^(g|kg|ml|l|litre|litres|oz|lb|lbs|cup|cups|tbsp|tbs|tablespoon|tablespoons|tsp|teaspoon|teaspoons|clove|cloves|can|cans|tin|tins|slice|slices|sprig|sprigs|pinch|handful|bunch|packet|pack|sheet|sheets|stick|sticks|piece|pieces)\b/i;
  const unitMatch = rest.match(UNITS);
  if (unitMatch) {
    const notes = rest.slice(unitMatch[0].length).trim();
    return { amount, unit: unitMatch[1].toLowerCase(), ...(notes ? { notes } : {}) };
  }
  return { amount, unit: '', notes: rest };
}

/**
 * Instructions arrive as one blob. Most are paragraph-separated; some are
 * prefixed "STEP 1" / "step 1"; a few are one long run of sentences.
 */
export function splitInstructions(blob: string): string[] {
  const text = (blob || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  // Explicit step markers win when present.
  if (/^\s*step\s*\d+/im.test(text)) {
    return text
      .split(/^\s*step\s*\d+\s*[:.\)]?\s*$/gim)
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  const paragraphs = text
    .split(/\n\s*\n|\n/)
    .map(s => s.replace(/^\s*\d+[.)]\s*/, '').replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 2);

  if (paragraphs.length > 1) return paragraphs;

  // Single run — fall back to grouping sentences so Cook Mode has real steps
  // rather than one wall of text.
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  const steps: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    steps.push(sentences.slice(i, i + 2).join(' ').replace(/\s+/g, ' ').trim());
  }
  return steps.filter(Boolean);
}

/** No difficulty field upstream; infer it from the shape of the recipe. */
function inferDifficulty(ingredientCount: number, stepCount: number): Difficulty {
  const score = ingredientCount + stepCount * 1.5;
  if (score <= 14) return Difficulty.EASY;
  if (score <= 26) return Difficulty.MEDIUM;
  return Difficulty.HARD;
}

/** TheMealDB's free-text tags plus category, normalised to our tag style. */
function buildTags(meal: RawMeal): string[] {
  const tags = new Set<string>();
  for (const t of (meal.strTags ?? '').split(',')) {
    const v = t.trim();
    if (v) tags.add(v);
  }
  if (meal.strCategory) {
    const c = meal.strCategory.trim();
    if (c === 'Vegetarian' || c === 'Vegan') tags.add(c);
  }
  return [...tags];
}

/* ------------------------------------------------------------------- import */

async function fetchLetter(letter: string): Promise<RawMeal[]> {
  const res = await fetch(`${API}${letter}`);
  if (!res.ok) throw new Error(`TheMealDB ${letter}: HTTP ${res.status}`);
  const json = (await res.json()) as { meals: RawMeal[] | null };
  return json.meals ?? [];
}

async function importMeal(meal: RawMeal) {
  const source = `themealdb:${meal.idMeal}`;

  const ingredients = Array.from({ length: 20 }, (_, i) => i + 1)
    .map(i => ({
      name: (meal[`strIngredient${i}`] ?? '').trim(),
      measure: (meal[`strMeasure${i}`] ?? '').trim(),
    }))
    .filter(x => x.name.length > 0)
    .map((x, idx) => {
      const { amount, unit, notes } = parseMeasure(x.measure);
      return { name: x.name, amount, unit, notes, order: idx + 1 };
    });

  const steps = splitInstructions(meal.strInstructions);
  if (ingredients.length === 0 || steps.length === 0) return 'skipped';

  const data = {
    title: meal.strMeal.trim(),
    description: null,
    imageUrl: meal.strMealThumb || null,
    servings: 4,
    // Unknown upstream. 0 means "unknown" to the app, which hides the chip;
    // the enrichment pass replaces these with real estimates.
    prepTime: 0,
    cookTime: 0,
    totalTime: 0,
    difficulty: inferDifficulty(ingredients.length, steps.length),
    cuisine: meal.strArea?.trim() || null,
    // The course, kept distinct from dietary tags — it's what stops a planner
    // putting a dessert in a dinner slot.
    mealCategory: meal.strCategory?.trim() || null,
    dietaryTags: buildTags(meal),
    isAIGenerated: false,
    source,
    isPublic: true,
  };

  const existing = await prisma.recipe.findFirst({
    where: { source },
    include: { instructions: { select: { step: true, tip: true } } },
  });

  if (existing) {
    // Never clobber the enrichment pass. Timings and difficulty are guesses
    // here but real estimates once enriched, and step tips live on rows this
    // function replaces — an earlier version of this script silently wiped
    // both on every re-import.
    const isEnriched = existing.safetyNote !== null;
    const { prepTime, cookTime, totalTime, difficulty, ...importOwned } = data;
    await prisma.recipe.update({
      where: { id: existing.id },
      data: isEnriched
        ? importOwned
        : { ...importOwned, prepTime, cookTime, totalTime, difficulty },
    });

    const tipsByStep = new Map(
      existing.instructions.filter(i => i.tip).map(i => [i.step, i.tip])
    );

    await prisma.recipeIngredient.deleteMany({ where: { recipeId: existing.id } });
    await prisma.recipeInstruction.deleteMany({ where: { recipeId: existing.id } });
    await prisma.recipeIngredient.createMany({
      data: ingredients.map(i => ({ ...i, recipeId: existing.id })),
    });
    await prisma.recipeInstruction.createMany({
      data: steps.map((instruction, i) => ({
        recipeId: existing.id,
        step: i + 1,
        instruction,
        // Carried across only when the step count is unchanged, so a tip can't
        // end up attached to a different instruction than it was written for.
        tip: steps.length === existing.instructions.length ? (tipsByStep.get(i + 1) ?? null) : null,
      })),
    });
    return 'updated';
  }

  await prisma.recipe.create({
    data: {
      ...data,
      ingredients: { create: ingredients },
      instructions: {
        create: steps.map((instruction, i) => ({ step: i + 1, instruction })),
      },
    },
  });
  return 'created';
}

async function main() {
  console.log('Importing recipes from TheMealDB…\n');
  const seen = new Set<string>();
  const tally = { created: 0, updated: 0, skipped: 0, failed: 0 };

  for (const letter of LETTERS) {
    let meals: RawMeal[] = [];
    try {
      meals = await fetchLetter(letter);
    } catch (err) {
      console.warn(`  ${letter}: fetch failed — ${(err as Error).message}`);
      continue;
    }

    for (const meal of meals) {
      if (seen.has(meal.idMeal)) continue;
      seen.add(meal.idMeal);
      try {
        const outcome = await importMeal(meal);
        tally[outcome as keyof typeof tally]++;
      } catch (err) {
        tally.failed++;
        console.warn(`  "${meal.strMeal}" failed — ${(err as Error).message}`);
      }
    }
    process.stdout.write(`  ${letter}: ${meals.length} meals\r`);
  }

  const total = await prisma.recipe.count();
  const withImages = await prisma.recipe.count({ where: { imageUrl: { not: null } } });
  console.log('\n');
  console.log(`  created ${tally.created}  updated ${tally.updated}  skipped ${tally.skipped}  failed ${tally.failed}`);
  console.log(`  recipes in db: ${total} (${withImages} with photography)`);
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
