import axios from 'axios';

import { TTL, cacheGet, cacheSet } from '../cache';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * A recipe source outside the local corpus, for when local results are thin.
 *
 * Deliberately limited to **seeding the compose node**, never to making a
 * recommendation. A recommended recipe has to be openable, cookable hands-free
 * and addable to a meal plan, and an external hit is none of those: it has no
 * row, no id, and no photograph in our storage. Returning one as a
 * recommendation would put a card on screen that goes nowhere.
 *
 * It also cannot be fused with the local signals. RRF combines *rankings*, and
 * an external hit has no rank in the local index and no embedding — producing
 * one would mean running the embedding model on every external result inside a
 * chat turn, which costs more latency than the results are worth. So these
 * arrive as extra ideas for the compose prompt and are scored by nothing.
 *
 * Off by default. Every call is a third-party request on the critical path of a
 * chat turn, and the flag is the gate on that cost.
 */

export interface OverflowRecipe {
  title: string;
  cuisine: string | null;
  ingredients: string[];
  /** Where it came from, so a log can attribute an idea to its source. */
  source: string;
}

const THEMEALDB_SEARCH = 'https://www.themealdb.com/api/json/v1/1/search.php';

interface MealDbMeal {
  strMeal: string;
  strArea: string | null;
  [key: string]: string | null;
}

/**
 * TheMealDB, reached by name.
 *
 * LICENSING: free for development and education; commercial use expects a
 * supporter key. The same constraint `import-recipes.ts` carries, and it has to
 * be resolved before this is switched on in anything commercial — which is part
 * of why the default is off.
 */
async function fromTheMealDb(query: string, limit: number): Promise<OverflowRecipe[]> {
  const response = await axios.get<{ meals: MealDbMeal[] | null }>(THEMEALDB_SEARCH, {
    params: { s: query },
    timeout: 5_000,
  });

  return (response.data.meals ?? []).slice(0, limit).map(meal => ({
    title: meal.strMeal.trim(),
    cuisine: meal.strArea?.trim() || null,
    ingredients: Array.from({ length: 20 }, (_, i) => i + 1)
      .map(i => (meal[`strIngredient${i}`] ?? '').trim())
      .filter(Boolean),
    source: 'themealdb',
  }));
}

/**
 * Fetch external ideas for a query.
 *
 * Returns an empty list on anything going wrong, including the flag being off.
 * A chat turn must never fail because a third party is slow, and the caller has
 * a perfectly good answer without these.
 */
export async function overflowSeeds(query: string, limit = 3): Promise<OverflowRecipe[]> {
  if (!config.RECIPE_OVERFLOW_ENABLED) return [];

  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const cacheKey = `overflow:${trimmed.toLowerCase().slice(0, 120)}`;
  const cached = await cacheGet<{ recipes: OverflowRecipe[] }>(cacheKey);
  if (cached) return cached.recipes.slice(0, limit);

  try {
    const recipes = await fromTheMealDb(trimmed, limit);
    await cacheSet(cacheKey, { recipes }, recipes.length ? TTL.hit : TTL.miss);

    logger.info('Overflow recipe source consulted', { query: trimmed, hits: recipes.length });
    return recipes;
  } catch (error) {
    logger.warn('Overflow recipe source unavailable', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
