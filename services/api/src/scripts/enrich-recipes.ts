/**
 * Fills in what TheMealDB doesn't carry, using the LLM.
 *
 *   pnpm --filter @petra/api run db:enrich-recipes [--limit 40] [--all]
 *
 * The extraction itself runs in the agent service (POST /v1/recipes/enrich),
 * which owns every model call. This script owns the database write — the
 * agent has no permission to touch the recipes table.
 *
 * Adds, per recipe: nutrition, prep/cook times, a "Cook it safe" note, a
 * "Nothing gets binned" note, and a per-step tip for Cook Mode. These are the
 * fields the mockup's callouts are built on, and nothing upstream provides
 * them.
 *
 * Estimates are labelled as estimates in the UI. The alternative — shipping
 * blank macro grids and empty callouts — makes those screens look broken, and
 * the alternative to *that* (hand-writing 800 recipes' worth of guidance) isn't
 * real. What matters is that a failed or malformed response is skipped rather
 * than written, so nothing lands in the database that wasn't validated.
 *
 * Idempotent: recipes that already have a safetyNote and nutrition are skipped
 * unless --all is passed.
 */

import { PrismaClient } from '@prisma/client';
import type { EnrichRecipeResponse } from '@petra/agent-contract';

import { agentClient } from '../services/agent-client';

const prisma = new PrismaClient();

const argLimit = Number(process.argv[process.argv.indexOf('--limit') + 1]);
const LIMIT = Number.isFinite(argLimit) && argLimit > 0 ? argLimit : 40;
const ALL = process.argv.includes('--all');
/** `--category Breakfast` — enrich a specific course, e.g. to give the planner
 *  enough real breakfasts to choose from rather than falling back to sides. */
const catIdx = process.argv.indexOf('--category');
const CATEGORY = catIdx > -1 ? process.argv[catIdx + 1] : undefined;

/** The agent's validated extraction; see @petra/agent-contract. */
type Enrichment = EnrichRecipeResponse;

async function enrich(recipe: any): Promise<'ok' | 'invalid' | 'failed'> {
  // The agent runs the extraction and validates it. An implausible or
  // malformed response never comes back — it throws there — so anything that
  // reaches this line is safe to write.
  let data: Enrichment;
  try {
    data = await agentClient.enrichRecipe({
      title: recipe.title,
      cuisine: recipe.cuisine,
      servings: recipe.servings,
      ingredients: recipe.ingredients.map((i: any) => ({
        name: i.name,
        amount: i.amount,
        unit: i.unit,
      })),
      instructions: recipe.instructions.map((s: any) => ({
        step: s.step,
        instruction: s.instruction,
      })),
    });
  } catch (err) {
    console.warn(`  ✗ ${recipe.title}: ${(err as Error).message}`);
    return 'invalid';
  }

  await prisma.$transaction(async tx => {
    await tx.recipe.update({
      where: { id: recipe.id },
      data: {
        prepTime: data.prepTime,
        cookTime: data.cookTime,
        totalTime: data.prepTime + data.cookTime,
        difficulty: data.difficulty,
        safetyNote: data.safetyNote,
        zeroWasteNote: data.zeroWasteNote,
      },
    });

    await tx.recipeNutrition.upsert({
      where: { recipeId: recipe.id },
      create: { recipeId: recipe.id, ...data.nutrition },
      update: data.nutrition,
    });

    for (const { step, tip } of data.stepTips) {
      await tx.recipeInstruction.updateMany({
        where: { recipeId: recipe.id, step },
        data: { tip },
      });
    }
  });

  return 'ok';
}

async function main() {
  const needsWork = ALL
    ? {}
    : { OR: [{ safetyNote: null }, { nutrition: { is: null } }, { totalTime: 0 }] };
  const where = CATEGORY ? { AND: [needsWork, { mealCategory: CATEGORY }] } : needsWork;

  const recipes = await prisma.recipe.findMany({
    where,
    // Photographed recipes are the ones the app puts on screen, so they earn
    // the enrichment budget first.
    orderBy: [{ imageUrl: 'desc' }, { createdAt: 'asc' }],
    take: LIMIT,
    include: {
      ingredients: { orderBy: { order: 'asc' } },
      instructions: { orderBy: { step: 'asc' } },
    },
  });

  console.log(`Enriching ${recipes.length} recipes…\n`);
  const tally = { ok: 0, invalid: 0, failed: 0 };

  for (const [i, recipe] of recipes.entries()) {
    const outcome = await enrich(recipe);
    tally[outcome]++;
    if (outcome === 'ok') console.log(`  ✓ ${i + 1}/${recipes.length} ${recipe.title}`);
    // Stay under the free-tier rate limit.
    await new Promise(r => setTimeout(r, 1200));
  }

  const enriched = await prisma.recipe.count({ where: { safetyNote: { not: null } } });
  const withNutrition = await prisma.recipeNutrition.count();
  console.log(`\n  ok ${tally.ok}  invalid ${tally.invalid}  failed ${tally.failed}`);
  console.log(`  ${enriched} recipes have guidance, ${withNutrition} have nutrition`);
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
