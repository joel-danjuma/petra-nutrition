import type { FoodDatabase, FoodMatch } from '../../src/nutrition';

/**
 * A fixed nutrition table.
 *
 * Every figure here is USDA per-100g reference data, so a hand calculation
 * against it is a real check rather than a check against itself. Determinism is
 * a stated requirement of the nutrition node — same input, same numbers, every
 * run — and that cannot be asserted against a live, rate-limited API.
 */
export const FIXTURE_FOODS: Record<string, FoodMatch> = {
  'chicken breast': {
    macros: { calories: 120, protein: 22.5, carbs: 0, fat: 2.6, sodium: 45 },
    source: 'usda',
    matchedAs: 'Chicken, broilers or fryers, breast, meat only, raw',
    fdcId: 171477,
  },
  linguine: {
    macros: { calories: 371, protein: 13.0, carbs: 74.7, fat: 1.5, fiber: 3.2, sugar: 2.7 },
    source: 'usda',
    matchedAs: 'Pasta, dry, enriched',
    fdcId: 168927,
  },
  'bell pepper': {
    macros: { calories: 31, protein: 1.0, carbs: 6.0, fat: 0.3, fiber: 2.1, sugar: 4.2 },
    source: 'usda',
    matchedAs: 'Peppers, sweet, red, raw',
    fdcId: 170108,
  },
  'olive oil': {
    macros: { calories: 884, protein: 0, carbs: 0, fat: 100 },
    source: 'usda',
    matchedAs: 'Oil, olive, salad or cooking',
    fdcId: 171413,
  },
  salt: {
    macros: { calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 38758 },
    source: 'usda',
    matchedAs: 'Salt, table',
    fdcId: 173468,
  },
  'black pepper': {
    macros: { calories: 251, protein: 10.4, carbs: 63.9, fat: 3.3, fiber: 25.3 },
    source: 'usda',
    matchedAs: 'Spices, pepper, black',
    fdcId: 170931,
  },
};

/**
 * Matches on the longest fixture key contained in the name, so "boneless
 * chicken breasts" resolves to the chicken breast row — the same
 * substring-and-normalise behaviour the real lookup has, without the network.
 */
export const fixtureFoodDatabase: FoodDatabase = {
  async lookup(name: string): Promise<FoodMatch | null> {
    const needle = name.toLowerCase();
    const keys = Object.keys(FIXTURE_FOODS).sort((a, b) => b.length - a.length);
    for (const key of keys) {
      if (needle.includes(key)) return FIXTURE_FOODS[key];
      // "bell peppers" -> "bell pepper"
      if (needle.replace(/s\b/g, '').includes(key)) return FIXTURE_FOODS[key];
    }
    return null;
  },
};

/** A well-formed composed recipe for the failing case, as JSON. */
export const LINGUINE_RECIPE = JSON.stringify({
  title: 'Chicken and Bell Pepper Linguine',
  description: 'Seared chicken and sweet peppers tossed through linguine in a glossy pan sauce.',
  cuisine: 'Italian',
  servings: 2,
  prepTime: 10,
  cookTime: 20,
  difficulty: 'EASY',
  ingredients: [
    { name: 'chicken breast', amount: 2, unit: 'whole', notes: 'diced into 2cm pieces' },
    { name: 'linguine', amount: 200, unit: 'g' },
    { name: 'bell pepper', amount: 2, unit: 'whole', notes: 'sliced' },
    { name: 'olive oil', amount: 2, unit: 'tbsp' },
    { name: 'salt', amount: 1, unit: 'tsp' },
    { name: 'black pepper', amount: 0.5, unit: 'tsp' },
  ],
  instructions: [
    {
      step: 1,
      instruction:
        'Bring a large pan of well-salted water to the boil and cook the linguine until just short of tender, about a minute less than the packet says.',
      duration: 9,
      tip: 'Reserve a mugful of the starchy pasta water before you drain — it is what makes the sauce cling.',
    },
    {
      step: 2,
      instruction:
        'Meanwhile heat the olive oil in a wide frying pan over a high heat and sear the diced chicken breast in one layer until deeply golden, turning once.',
      duration: 6,
    },
    {
      step: 3,
      instruction:
        'Add the sliced bell pepper and cook until it softens at the edges but still has bite, seasoning with salt and black pepper as it goes.',
      duration: 4,
    },
    {
      step: 4,
      instruction:
        'Drain the linguine and tip it into the pan with a splash of the reserved pasta water, tossing hard until the sauce thickens and coats every strand.',
      duration: 2,
    },
  ],
  safetyNote:
    'Chicken breast should reach 74C at its thickest point; cut into the largest piece to check it is opaque all the way through.',
  zeroWasteNote:
    'Pepper cores and chicken trim make a quick stock. Leftovers reheat best in a pan with another splash of water rather than in the microwave.',
});
