import axios from 'axios';

import { TTL, cacheGet, cacheSet } from '../cache';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Turning an ingredient name into macros per 100g.
 *
 * The model is not involved. A language model asked for the protein content of
 * chicken breast returns a plausible number, and plausible is the problem:
 * there is no way to tell a remembered figure from an invented one, and the
 * result is a macro panel that looks authoritative and cannot be checked. So
 * every number here comes from a database row, and every row is recorded
 * alongside the total it contributed to.
 *
 * Two sources, chosen to match what the app already does:
 *
 *  - **USDA FoodData Central** for raw ingredients — chicken breast, linguine,
 *    bell pepper. Free, per-key rate limited, and the standard reference.
 *  - **Open Food Facts** for branded items, reached through the same endpoint
 *    the pantry barcode scanner already uses. A user whose pantry says "Heinz
 *    baked beans" should get Heinz's numbers, not the USDA's generic ones.
 *
 * Results are cached in Redis on a normalised name, a day for a hit and an
 * hour for a miss — the same shape as `barcode.ts`, and for the same reason:
 * the upstream API is rate limited and an ingredient name that missed once will
 * miss again.
 */

export interface FoodMacros {
  /** Per 100g, which is how both databases report. */
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  /** Milligrams per 100g. */
  sodium?: number;
}

export interface FoodMatch {
  macros: FoodMacros;
  source: 'usda' | 'openfoodfacts';
  /** The row that was matched, verbatim, so a wrong match is visible. */
  matchedAs: string;
  fdcId?: number;
}

/**
 * The seam the nutrition node depends on.
 *
 * An interface rather than a direct call because determinism is a requirement
 * here — "same input, same numbers, every run" — and a test cannot assert that
 * against a live rate-limited API over the network. Tests inject a fixture
 * table; production injects `usdaFoodDatabase`.
 */
export interface FoodDatabase {
  lookup(ingredientName: string): Promise<FoodMatch | null>;
}

/** Cache key normalisation: "  Chicken Breasts " and "chicken breast" are one. */
export function normaliseFoodKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => (w.endsWith('es') ? w.slice(0, -2) : w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ');
}

/**
 * Reference macros for the staples, held locally.
 *
 * Checked before any network call, for two reasons that both showed up the
 * first time this ran against real models.
 *
 * The first is correctness. Without a `FDC_API_KEY` the lookup falls through to
 * searching Open Food Facts *by name*, which is unreliable in a specific and
 * damaging way: it happily matched "garlic powder" and returned nothing for
 * "olive oil". A pasta dish built on two tablespoons of oil and a knob of
 * butter then reported 5g of fat per serving instead of about 30 — the single
 * largest contributor to the dish silently missing, and the panel still looking
 * like a measurement.
 *
 * The second is that these values do not vary. Olive oil is 100% fat and salt
 * is sodium; there is nothing to look up, and asking a rate-limited third-party
 * search engine about it on every turn was always the wrong shape.
 *
 * All figures per 100g, from USDA reference entries.
 */
const STAPLE_MACROS: Record<string, { macros: FoodMacros; matchedAs: string }> = {
  'olive oil': { macros: { calories: 884, protein: 0, carbs: 0, fat: 100 }, matchedAs: 'Oil, olive, salad or cooking' },
  'vegetable oil': { macros: { calories: 884, protein: 0, carbs: 0, fat: 100 }, matchedAs: 'Oil, vegetable' },
  'sunflower oil': { macros: { calories: 884, protein: 0, carbs: 0, fat: 100 }, matchedAs: 'Oil, sunflower' },
  oil: { macros: { calories: 884, protein: 0, carbs: 0, fat: 100 }, matchedAs: 'Oil, vegetable' },
  butter: { macros: { calories: 717, protein: 0.85, carbs: 0.06, fat: 81.1, sodium: 576 }, matchedAs: 'Butter, salted' },
  salt: { macros: { calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 38758 }, matchedAs: 'Salt, table' },
  'sea salt': { macros: { calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 38758 }, matchedAs: 'Salt, table' },
  'black pepper': { macros: { calories: 251, protein: 10.4, carbs: 63.9, fat: 3.3, fiber: 25.3 }, matchedAs: 'Spices, pepper, black' },
  'white pepper': { macros: { calories: 296, protein: 10.4, carbs: 68.6, fat: 2.1, fiber: 26.2 }, matchedAs: 'Spices, pepper, white' },
  paprika: { macros: { calories: 282, protein: 14.1, carbs: 54, fat: 12.9, fiber: 34.9 }, matchedAs: 'Spices, paprika' },
  'smoked paprika': { macros: { calories: 282, protein: 14.1, carbs: 54, fat: 12.9, fiber: 34.9 }, matchedAs: 'Spices, paprika' },
  'garlic powder': { macros: { calories: 331, protein: 16.6, carbs: 72.7, fat: 0.7, fiber: 9 }, matchedAs: 'Spices, garlic powder' },
  'onion powder': { macros: { calories: 341, protein: 10.4, carbs: 79.1, fat: 1, fiber: 15.2 }, matchedAs: 'Spices, onion powder' },
  'ground cumin': { macros: { calories: 375, protein: 17.8, carbs: 44.2, fat: 22.3, fiber: 10.5 }, matchedAs: 'Spices, cumin seed' },
  'ground coriander': { macros: { calories: 298, protein: 12.4, carbs: 55, fat: 17.8, fiber: 41.9 }, matchedAs: 'Spices, coriander seed' },
  'ground cinnamon': { macros: { calories: 247, protein: 4, carbs: 80.6, fat: 1.2, fiber: 53.1 }, matchedAs: 'Spices, cinnamon, ground' },
  'ground nutmeg': { macros: { calories: 525, protein: 5.8, carbs: 49.3, fat: 36.3, fiber: 20.8 }, matchedAs: 'Spices, nutmeg, ground' },
  turmeric: { macros: { calories: 312, protein: 9.7, carbs: 67.1, fat: 3.3, fiber: 22.7 }, matchedAs: 'Spices, turmeric, ground' },
  'curry powder': { macros: { calories: 325, protein: 14.3, carbs: 55.8, fat: 14, fiber: 53.2 }, matchedAs: 'Spices, curry powder' },
  'cayenne pepper': { macros: { calories: 318, protein: 12, carbs: 56.6, fat: 17.3, fiber: 27.2 }, matchedAs: 'Spices, pepper, red or cayenne' },
  'chilli flakes': { macros: { calories: 318, protein: 12, carbs: 56.6, fat: 17.3, fiber: 27.2 }, matchedAs: 'Spices, pepper, red, crushed' },
  'red pepper flakes': { macros: { calories: 318, protein: 12, carbs: 56.6, fat: 17.3, fiber: 27.2 }, matchedAs: 'Spices, pepper, red, crushed' },
  'dried oregano': { macros: { calories: 265, protein: 9, carbs: 68.9, fat: 4.3, fiber: 42.5 }, matchedAs: 'Spices, oregano, dried' },
  'dried basil': { macros: { calories: 233, protein: 23, carbs: 47.8, fat: 4, fiber: 37.7 }, matchedAs: 'Spices, basil, dried' },
  'dried thyme': { macros: { calories: 276, protein: 9.1, carbs: 63.9, fat: 7.4, fiber: 37 }, matchedAs: 'Spices, thyme, dried' },
  'dried rosemary': { macros: { calories: 331, protein: 4.9, carbs: 64.1, fat: 15.2, fiber: 42.6 }, matchedAs: 'Spices, rosemary, dried' },
  'dried parsley': { macros: { calories: 292, protein: 26.6, carbs: 50.6, fat: 5.5, fiber: 26.7 }, matchedAs: 'Spices, parsley, dried' },
  'dried mixed herbs': { macros: { calories: 265, protein: 9, carbs: 68.9, fat: 4.3, fiber: 42.5 }, matchedAs: 'Spices, mixed dried herbs' },
  'bay leaf': { macros: { calories: 313, protein: 7.6, carbs: 75, fat: 8.4, fiber: 26.3 }, matchedAs: 'Spices, bay leaf' },
  sugar: { macros: { calories: 387, protein: 0, carbs: 100, fat: 0, sugar: 99.8 }, matchedAs: 'Sugars, granulated' },
  'plain flour': { macros: { calories: 364, protein: 10.3, carbs: 76.3, fat: 1, fiber: 2.7 }, matchedAs: 'Wheat flour, white, all-purpose' },
  flour: { macros: { calories: 364, protein: 10.3, carbs: 76.3, fat: 1, fiber: 2.7 }, matchedAs: 'Wheat flour, white, all-purpose' },
};

/**
 * Ingredients that never reach the plate.
 *
 * Pasta water is drained, and a stock the dish is poached in and then discarded
 * is not eaten. Counting them is not a rounding error: four cups of water
 * resolved to 960g and, matched by name against a branded database, came back
 * carrying sodium — inflating a figure the panel presents as measured.
 *
 * They are reported as excluded rather than unresolved, so the provenance list
 * says "not counted, deliberately" instead of "we could not find this".
 */
const NOT_EATEN = /^\s*(cold |hot |boiling |warm |filtered |tap )?water\s*$/i;

export const isNotEaten = (name: string): boolean => NOT_EATEN.test(name.trim());

/** Reference macros for a staple, or null if it is not one. */
export function stapleMacros(name: string): FoodMatch | null {
  const key = normaliseFoodKey(name);
  if (!key) return null;

  // Longest key first, so "black pepper" beats "pepper" and "olive oil" beats
  // "oil". An exact match wins outright.
  const exact = STAPLE_MACROS[key];
  if (exact) return { macros: exact.macros, source: 'usda', matchedAs: exact.matchedAs };

  const keys = Object.keys(STAPLE_MACROS).sort((a, b) => b.length - a.length);
  for (const candidate of keys) {
    if (key === candidate || key.endsWith(` ${candidate}`) || key.startsWith(`${candidate} `)) {
      const hit = STAPLE_MACROS[candidate];
      return { macros: hit.macros, source: 'usda', matchedAs: hit.matchedAs };
    }
  }

  return null;
}

const FDC_SEARCH = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const OFF_SEARCH = 'https://world.openfoodfacts.org/cgi/search.pl';

/** FoodData Central nutrient ids, which is how the API keys its numbers. */
const FDC_NUTRIENTS: Record<number, keyof FoodMacros> = {
  1008: 'calories',
  1003: 'protein',
  1005: 'carbs',
  1004: 'fat',
  1079: 'fiber',
  2000: 'sugar',
  1093: 'sodium',
};

interface FdcFood {
  fdcId: number;
  description: string;
  dataType?: string;
  foodNutrients?: { nutrientId?: number; nutrientNumber?: string; value?: number }[];
}

/**
 * Which FDC row to take.
 *
 * `Foundation` and `SR Legacy` are the analysed reference entries — measured in
 * a lab, one row per food. `Branded` is manufacturer-submitted and enormous, and
 * searching "chicken breast" against it returns a frozen breaded ready meal
 * before it returns chicken. Preferring the reference data types is the
 * difference between 165 kcal and 230.
 */
const DATA_TYPE_RANK: Record<string, number> = {
  Foundation: 0,
  'SR Legacy': 1,
  Survey: 2,
  'SR-Legacy': 1,
  Branded: 9,
};

const rankOf = (food: FdcFood): number => DATA_TYPE_RANK[food.dataType ?? ''] ?? 5;

function macrosFromFdc(food: FdcFood): FoodMacros | null {
  const out: Partial<FoodMacros> = {};

  for (const nutrient of food.foodNutrients ?? []) {
    const id = nutrient.nutrientId ?? Number(nutrient.nutrientNumber);
    const key = FDC_NUTRIENTS[id];
    if (!key) continue;
    if (typeof nutrient.value !== 'number' || !Number.isFinite(nutrient.value)) continue;
    out[key] = nutrient.value;
  }

  // The four macros are the contract. A row missing one of them cannot be
  // summed into a total, and filling the gap with a zero understates the dish.
  if (
    out.calories === undefined ||
    out.protein === undefined ||
    out.carbs === undefined ||
    out.fat === undefined
  ) {
    return null;
  }

  return out as FoodMacros;
}

class UsdaFoodDatabase implements FoodDatabase {
  async lookup(ingredientName: string): Promise<FoodMatch | null> {
    const key = normaliseFoodKey(ingredientName);
    if (!key) return null;

    const cacheKey = `nutrition:food:${key}`;
    // Wrapped in an envelope so a cached negative can be told apart from a
    // cache miss. Storing the bare `null` makes them identical — `JSON.parse`
    // hands back `null` for both — and the negative cache silently never
    // works, which is how a rate-limited API gets hammered by the same failing
    // ingredient name on every turn.
    const cached = await cacheGet<{ match: FoodMatch | null }>(cacheKey);
    if (cached) return cached.match;

    const match = (await this.fromFdc(key)) ?? (await this.fromOpenFoodFacts(key));

    await cacheSet(cacheKey, { match }, match ? TTL.hit : TTL.miss);
    return match;
  }

  private async fromFdc(query: string): Promise<FoodMatch | null> {
    if (!config.FDC_API_KEY) return null;

    try {
      const response = await axios.get<{ foods?: FdcFood[] }>(FDC_SEARCH, {
        timeout: 8_000,
        params: {
          api_key: config.FDC_API_KEY,
          query,
          pageSize: 10,
          dataType: 'Foundation,SR Legacy,Survey (FNDDS)',
        },
      });

      const foods = (response.data.foods ?? []).slice().sort((a, b) => rankOf(a) - rankOf(b));

      for (const food of foods) {
        const macros = macrosFromFdc(food);
        if (macros) {
          return { macros, source: 'usda', matchedAs: food.description, fdcId: food.fdcId };
        }
      }

      return null;
    } catch (error) {
      logger.warn('FoodData Central lookup failed', {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Branded fallback, through the endpoint the barcode scanner already uses.
   *
   * Reached by name rather than by barcode here, which is much less reliable —
   * so it only runs when FDC has nothing, and the matched product name comes
   * back with it so a bad match is visible rather than merely wrong.
   */
  private async fromOpenFoodFacts(query: string): Promise<FoodMatch | null> {
    try {
      const response = await axios.get<{
        products?: { product_name?: string; nutriments?: Record<string, number> }[];
      }>(OFF_SEARCH, {
        timeout: 8_000,
        params: {
          search_terms: query,
          search_simple: 1,
          action: 'process',
          json: 1,
          page_size: 5,
        },
        headers: { 'User-Agent': 'Petra-AI/1.0 (contact@petra-ai.com)' },
      });

      for (const product of response.data.products ?? []) {
        const n = product.nutriments ?? {};
        const calories = n['energy-kcal_100g'];
        const protein = n.proteins_100g;
        const carbs = n.carbohydrates_100g;
        const fat = n.fat_100g;

        if (
          typeof calories !== 'number' ||
          typeof protein !== 'number' ||
          typeof carbs !== 'number' ||
          typeof fat !== 'number'
        ) {
          continue;
        }

        return {
          macros: {
            calories,
            protein,
            carbs,
            fat,
            ...(typeof n.fiber_100g === 'number' ? { fiber: n.fiber_100g } : {}),
            ...(typeof n.sugars_100g === 'number' ? { sugar: n.sugars_100g } : {}),
            // Open Food Facts reports sodium in grams; RecipeNutrition is mg.
            ...(typeof n.sodium_100g === 'number' ? { sodium: n.sodium_100g * 1000 } : {}),
          },
          source: 'openfoodfacts',
          matchedAs: product.product_name ?? query,
        };
      }

      return null;
    } catch (error) {
      logger.warn('Open Food Facts lookup failed', {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

export const usdaFoodDatabase: FoodDatabase = new UsdaFoodDatabase();

/**
 * The database the nutrition node uses, and the seam for swapping it.
 *
 * A setter rather than a constructor argument threaded through three layers,
 * matching `setModel` in `llm/provider.ts`. It exists for the same reason:
 * determinism is a requirement here, and a test that asserts "same input, same
 * numbers, every run" must not reach a live rate-limited API to do it. Without
 * this the suite silently makes real Open Food Facts calls, which is slow,
 * flaky, and rude to a free service.
 */
let active: FoodDatabase = usdaFoodDatabase;

export const foodDatabase = (): FoodDatabase => active;

export function setFoodDatabase(next: FoodDatabase | null): void {
  active = next ?? usdaFoodDatabase;
}
