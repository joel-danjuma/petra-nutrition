import { prisma } from '../../db';
import { analyse } from '../../nutrition';
import { logger } from '../../utils/logger';
import { validateNutrition } from '../validate';
import { emitNode, turnSignal } from '../turn-context';
import type { GraphStateType, GraphUpdate } from '../state';

/**
 * Macros for the dish that was actually suggested.
 *
 * "Actually suggested" is the point. The old nutrition answer was generic
 * per-100g figures for the ingredients named, which is a different question
 * from "what am I eating if I cook this" — the one a person asking about
 * calories is asking.
 *
 * Two inputs, one output. A composed draft is analysed directly. A library
 * recommendation is read out of the database first: the recipe rows carry
 * amounts and units, which is all `analyse` needs.
 *
 * Failure here is not fatal. A dish with no macro panel is worse than a dish
 * with one and much better than an error, so an unresolvable nutrition pass
 * leaves `nutrition` null and records the gap as a compromise the reply states.
 */

export async function nutrition(state: GraphStateType): Promise<GraphUpdate> {
  emitNode('nutrition');

  // The compromises channel is overwrite-on-write, so anything an earlier node
  // recorded this turn — a constraint search could not meet, say — has to be
  // carried forward explicitly or it is lost on the way to the reply.
  const carried = state.compromises;

  try {
    const recipe = state.draft
      ? {
          servings: state.draft.servings,
          ingredients: state.draft.ingredients.map(i => ({
            name: i.name,
            amount: i.amount,
            unit: i.unit,
            ...(i.notes ? { notes: i.notes } : {}),
          })),
        }
      : await fromLibrary(state);

    if (!recipe) {
      return {
        compromises: [...carried, 'No macro breakdown — there is no specific dish to measure yet.'],
      };
    }

    const breakdown = await analyse(recipe, { signal: turnSignal() });

    // The same plausibility bounds `validateEnrichment` applies. A failure here
    // means a quantity was misread by an order of magnitude — 800g of salt
    // rather than 800mg — and the figure must not reach a screen just because
    // arithmetic produced it.
    const failures = validateNutrition(breakdown.perServing);
    if (failures.length) {
      logger.warn('Computed macros failed the plausibility check', {
        failures: failures.map(f => f.message),
      });
      return {
        compromises: [
          ...carried,
          'Held back the macro breakdown — the numbers came out implausible, ' +
            'which usually means a quantity was misread.',
        ],
      };
    }

    const compromises: string[] = [...carried];
    const unresolved = breakdown.items.filter(i => i.source === 'unresolved');
    if (unresolved.length) {
      compromises.push(
        `The macros leave out ${unresolved.map(i => i.ingredient).join(', ')} — ` +
          `couldn't match ${unresolved.length === 1 ? 'it' : 'them'} to a nutrition database.`
      );
    }

    return { macros: breakdown, compromises };
  } catch (error) {
    logger.warn('Nutrition node failed; continuing without macros', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { compromises: [...carried, 'No macro breakdown for this one — the lookup failed.'] };
  }
}

/**
 * Read the recommended recipe's ingredients out of the read model.
 *
 * Within the agent's projection: `recipes` and `recipe_ingredients` are both
 * part of it, and nothing here writes. `recipe_nutrition` deliberately is not —
 * the API owns that table, and this node computes rather than reads it.
 */
async function fromLibrary(state: GraphStateType) {
  const top = state.retrieved[0];
  if (!top) return null;

  const row = await prisma.recipe.findUnique({
    where: { id: top.id },
    select: {
      servings: true,
      ingredients: {
        select: { name: true, amount: true, unit: true, notes: true },
        orderBy: { order: 'asc' },
      },
    },
  });

  if (!row?.ingredients.length) return null;

  return {
    servings: row.servings,
    ingredients: row.ingredients.map(i => ({
      name: i.name,
      amount: i.amount,
      unit: i.unit,
      ...(i.notes ? { notes: i.notes } : {}),
    })),
  };
}
