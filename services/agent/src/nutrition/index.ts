import type {
  NutritionBreakdown,
  NutritionFacts,
  NutritionProvenance,
} from '@petra/agent-contract';
import { toGrams, unitWeightFor } from '@petra/food-measures';

import { parseJson } from '../llm/enrich';
import { modelFor } from '../llm/provider';
import { logger } from '../utils/logger';
import {
  foodDatabase,
  isNotEaten,
  stapleMacros,
  type FoodDatabase,
  type FoodMacros,
} from './foods';

/**
 * Macros for the portion actually suggested.
 *
 * Three steps, and only the first can involve a model:
 *
 *  1. **Quantity resolution.** "800g" and "2 tablespoons" are read by
 *     `@petra/food-measures`. Only a genuinely ambiguous count — "2 chicken
 *     breasts" where the table has no entry — is put to a model, and it is
 *     asked for one number and nothing else.
 *  2. **Food resolution.** One database lookup per ingredient, cached.
 *  3. **Summation.** Plain TypeScript. Sum by weight, divide by servings.
 *
 * The model never does the arithmetic. This is not a stylistic preference: a
 * model asked to total seven ingredients' macros produces a number that is
 * usually close and occasionally wrong by a factor, and there is no way to tell
 * which from the output. Arithmetic in code gives the same answer every run and
 * every number traces to a source row.
 *
 * Which is why `items` carries provenance. An ingredient that could not be
 * resolved appears with `source: 'unresolved'` and contributes nothing, so the
 * gap is *visible* instead of being quietly absorbed into a confident-looking
 * total.
 */

export interface RecipeForNutrition {
  servings: number;
  ingredients: { name: string; amount: number; unit: string; notes?: string }[];
}

export interface AnalyseOptions {
  /**
   * Overrides the module-level database for this call. Both seams exist
   * because they serve different callers: a unit test of `analyse` passes a
   * fixture here, while a graph test swaps the default with
   * `setFoodDatabase` and never touches `analyse` directly.
   */
  foods?: FoodDatabase;
  /** Set false in tests to assert the no-model path. Defaults to true. */
  allowModelWeights?: boolean;
  signal?: AbortSignal;
}

const round = (value: number, dp = 1): number => {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
};

/**
 * Scale a per-100g row to a mass.
 *
 * The one line of arithmetic the whole feature rests on, kept separate so it
 * can be read and checked on its own.
 */
export function scaleMacros(macros: FoodMacros, grams: number): NutritionFacts {
  const factor = grams / 100;
  return {
    calories: macros.calories * factor,
    protein: macros.protein * factor,
    carbs: macros.carbs * factor,
    fat: macros.fat * factor,
    ...(macros.fiber !== undefined ? { fiber: macros.fiber * factor } : {}),
    ...(macros.sugar !== undefined ? { sugar: macros.sugar * factor } : {}),
    ...(macros.sodium !== undefined ? { sodium: macros.sodium * factor } : {}),
  };
}

const EMPTY: NutritionFacts = { calories: 0, protein: 0, carbs: 0, fat: 0 };

function add(total: NutritionFacts, part: NutritionFacts): NutritionFacts {
  return {
    calories: total.calories + part.calories,
    protein: total.protein + part.protein,
    carbs: total.carbs + part.carbs,
    fat: total.fat + part.fat,
    ...(total.fiber !== undefined || part.fiber !== undefined
      ? { fiber: (total.fiber ?? 0) + (part.fiber ?? 0) }
      : {}),
    ...(total.sugar !== undefined || part.sugar !== undefined
      ? { sugar: (total.sugar ?? 0) + (part.sugar ?? 0) }
      : {}),
    ...(total.sodium !== undefined || part.sodium !== undefined
      ? { sodium: (total.sodium ?? 0) + (part.sodium ?? 0) }
      : {}),
  };
}

/* ----------------------------------------------------- step 1: quantities */

const WEIGHT_PROMPT = `You convert countable food quantities to grams. Reply with ONE JSON object and nothing else.

{ "grams": [ { "name": "<the ingredient, exactly as given>", "gramsEach": <number> } ] }

Rules:
- gramsEach is the weight of ONE of the item, raw and as bought, edible portion.
- Be conventional. A chicken breast is about 174g, an egg 50g, a garlic clove 3g.
- Give a number for every item listed. Never return a range, a string, or null.`;

interface ResolvedQuantity {
  name: string;
  grams: number | null;
  assumption?: string;
  /** True when a model supplied the per-unit weight. Downgrades confidence. */
  fromModel?: boolean;
}

/**
 * Work out the mass of every ingredient line.
 *
 * Everything parseable is parsed. What's left is a countable thing the weight
 * table doesn't know — a rarer vegetable, an unusual cut — and those go to a
 * model in one batched call, because one call for five unknowns is cheaper and
 * faster than five.
 */
export async function resolveQuantities(
  ingredients: RecipeForNutrition['ingredients'],
  opts: AnalyseOptions = {}
): Promise<ResolvedQuantity[]> {
  const resolved: ResolvedQuantity[] = ingredients.map(i => {
    const result = toGrams(i.name, i.amount, i.unit);
    return {
      name: i.name,
      grams: result.grams,
      ...(result.assumption ? { assumption: result.assumption } : {}),
    };
  });

  const unknown = ingredients
    .map((ingredient, index) => ({ ingredient, index }))
    .filter(
      ({ ingredient, index }) =>
        resolved[index].grams === null &&
        ingredient.amount > 0 &&
        // Only a *count* is worth asking about. An unreadable unit is a data
        // problem, not a knowledge gap, and a model asked to guess at one
        // invents both the unit and the number.
        !unitWeightFor(`${ingredient.unit} ${ingredient.name}`)
    );

  if (!unknown.length || opts.allowModelWeights === false) return resolved;

  try {
    const result = await modelFor('nutrition').complete(
      [
        { role: 'system', content: WEIGHT_PROMPT },
        {
          role: 'user',
          content: unknown
            .map(({ ingredient }) => `${ingredient.amount} ${ingredient.unit} ${ingredient.name}`.trim())
            .join('\n'),
        },
      ],
      { signal: opts.signal }
    );

    const parsed = parseJson(result.text) as { grams?: { name?: string; gramsEach?: number }[] };

    for (const { ingredient, index } of unknown) {
      const hit = (parsed.grams ?? []).find(
        g => typeof g.name === 'string' && g.name.toLowerCase().includes(ingredient.name.toLowerCase())
      );
      const each = hit?.gramsEach;
      // A per-unit weight over a kilo is a unit error, not a large vegetable.
      if (typeof each !== 'number' || !Number.isFinite(each) || each <= 0 || each > 2_000) {
        continue;
      }
      resolved[index] = {
        name: ingredient.name,
        grams: each * ingredient.amount,
        assumption: `one ${ingredient.name} estimated at about ${Math.round(each)}g`,
        fromModel: true,
      };
    }
  } catch (error) {
    // An unresolved quantity is reported as unresolved. It is never treated as
    // zero, which would understate the dish and look like a measurement.
    logger.warn('Countable-weight estimation failed; those items stay unresolved', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return resolved;
}

/* ------------------------------------------------------- steps 2 and 3 */

export async function analyse(
  recipe: RecipeForNutrition,
  opts: AnalyseOptions = {}
): Promise<NutritionBreakdown> {
  const foods = opts.foods ?? foodDatabase();
  const servings = Math.max(1, Math.round(recipe.servings) || 1);

  const quantities = await resolveQuantities(recipe.ingredients, opts);

  let total: NutritionFacts = { ...EMPTY };
  const items: NutritionProvenance[] = [];
  let estimated = 0;
  let unresolved = 0;

  for (let i = 0; i < recipe.ingredients.length; i++) {
    const ingredient = recipe.ingredients[i];
    const quantity = quantities[i];

    // Water the dish is cooked in and then drained of is not food. Left in, a
    // pot of pasta water resolves to roughly a kilo and — matched by name
    // against a branded database — arrives carrying sodium, inflating a number
    // the panel presents as measured. Reported as excluded, not unresolved:
    // "not counted, deliberately" is a different statement from "not found".
    if (isNotEaten(ingredient.name)) {
      items.push({
        ingredient: ingredient.name,
        grams: quantity.grams === null ? null : round(quantity.grams),
        source: 'excluded',
        matchedAs: 'not eaten — drained or discarded',
      });
      continue;
    }

    if (quantity.grams === null) {
      unresolved++;
      items.push({ ingredient: ingredient.name, grams: null, source: 'unresolved' });
      continue;
    }

    // Staples resolve from the local reference table before any database is
    // consulted. Deliberately here rather than inside the USDA client, so it
    // holds whichever database is injected: olive oil is 100% fat no matter
    // what is answering lookups, and a dish losing its main fat source because
    // a name search came up empty is the failure this prevents.
    const match = stapleMacros(ingredient.name) ?? (await foods.lookup(ingredient.name));

    if (!match) {
      unresolved++;
      items.push({
        ingredient: ingredient.name,
        grams: round(quantity.grams),
        source: 'unresolved',
        ...(quantity.assumption ? { assumption: quantity.assumption } : {}),
      });
      continue;
    }

    total = add(total, scaleMacros(match.macros, quantity.grams));
    if (quantity.fromModel) estimated++;

    items.push({
      ingredient: ingredient.name,
      grams: round(quantity.grams),
      source: match.source,
      matchedAs: match.matchedAs,
      ...(match.fdcId !== undefined ? { fdcId: match.fdcId } : {}),
      // Surfaced rather than discarded: "one bell pepper at about 150g" is the
      // difference between a figure a reader can sanity-check and one they have
      // to take on trust.
      ...(quantity.assumption ? { assumption: quantity.assumption } : {}),
    });
  }

  /**
   * Confidence is about how the numbers were obtained, not how large they are.
   *
   * Anything unresolved is a hole in the total, and a hole matters more than an
   * estimate — so it takes precedence. A dish where one ingredient's weight was
   * guessed is medium; a dish where one ingredient was never counted is low,
   * and the UI is expected to say which one.
   */
  const confidence: NutritionBreakdown['confidence'] =
    unresolved > 0 ? 'low' : estimated > 0 ? 'medium' : 'high';

  const perServing: NutritionFacts = {
    calories: Math.round(total.calories / servings),
    protein: round(total.protein / servings),
    carbs: round(total.carbs / servings),
    fat: round(total.fat / servings),
    ...(total.fiber !== undefined ? { fiber: round(total.fiber / servings) } : {}),
    ...(total.sugar !== undefined ? { sugar: round(total.sugar / servings) } : {}),
    ...(total.sodium !== undefined ? { sodium: Math.round(total.sodium / servings) } : {}),
  };

  logger.info('Nutrition computed', {
    ingredients: recipe.ingredients.length,
    unresolved,
    estimated,
    confidence,
    caloriesPerServing: perServing.calories,
  });

  return { perServing, servings, confidence, items };
}

export { foodDatabase, isNotEaten, setFoodDatabase, stapleMacros, usdaFoodDatabase } from './foods';
export type { FoodDatabase, FoodMatch, FoodMacros } from './foods';
