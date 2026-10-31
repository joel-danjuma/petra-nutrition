import { analyse, resolveQuantities, scaleMacros, stapleMacros } from '../src/nutrition';
import { normaliseFoodKey } from '../src/nutrition/foods';
import { FIXTURE_FOODS, fixtureFoodDatabase } from './helpers/fixtures';

/**
 * The nutrition path, and the property it has to have: **the same input gives
 * the same numbers, every run.**
 *
 * That is only true because the model is kept out of the arithmetic. It is
 * asked for exactly one thing — how many grams one of a countable item is, and
 * only when the weight table has no entry — and everything else is database
 * rows and multiplication. These tests check the multiplication against figures
 * worked out by hand, which is the only way to know the code agrees with
 * arithmetic rather than merely with itself.
 */

const options = { foods: fixtureFoodDatabase, allowModelWeights: false as const };

describe('scaleMacros', () => {
  it('scales a per-100g row to a mass', () => {
    // 348g of chicken breast at 120 kcal/100g is 417.6 kcal.
    const scaled = scaleMacros(FIXTURE_FOODS['chicken breast'].macros, 348);

    expect(scaled.calories).toBeCloseTo(417.6, 4);
    expect(scaled.protein).toBeCloseTo(78.3, 4);
  });

  it('carries optional fields only when the source row had them', () => {
    expect(scaleMacros(FIXTURE_FOODS['olive oil'].macros, 100).fiber).toBeUndefined();
    expect(scaleMacros(FIXTURE_FOODS.linguine.macros, 100).fiber).toBeCloseTo(3.2, 4);
  });
});

describe('resolveQuantities', () => {
  it('reads mass units exactly', async () => {
    const [linguine] = await resolveQuantities([{ name: 'linguine', amount: 200, unit: 'g' }], options);
    expect(linguine.grams).toBe(200);
  });

  it('applies a density to a volume, rather than treating it as water', async () => {
    // A tablespoon is 15ml and olive oil is 0.92 g/ml, so 2 tbsp is 27.6g.
    // Treating oil as water would add 2.4g of pure fat to the total.
    const [oil] = await resolveQuantities(
      [{ name: 'olive oil', amount: 2, unit: 'tbsp' }],
      options
    );
    expect(oil.grams).toBeCloseTo(27.6, 4);
  });

  it('uses the weight table for a countable thing, and says it did', async () => {
    const [chicken] = await resolveQuantities(
      [{ name: 'chicken breast', amount: 2, unit: 'whole' }],
      options
    );

    expect(chicken.grams).toBe(348);
    expect(chicken.assumption).toMatch(/174g/);
  });

  it('leaves an unreadable quantity unresolved rather than guessing zero', async () => {
    const [mystery] = await resolveQuantities(
      [{ name: 'dragon fruit', amount: 3, unit: 'whole' }],
      options
    );

    expect(mystery.grams).toBeNull();
  });
});

describe('analyse', () => {
  /** The dish from the acceptance case, with every figure worked out by hand. */
  const recipe = {
    servings: 2,
    ingredients: [
      { name: 'chicken breast', amount: 2, unit: 'whole' },
      { name: 'linguine', amount: 200, unit: 'g' },
      { name: 'bell pepper', amount: 2, unit: 'whole' },
      { name: 'olive oil', amount: 2, unit: 'tbsp' },
    ],
  };

  it('matches a hand calculation', async () => {
    const result = await analyse(recipe, options);

    // chicken 348g  -> 417.60 kcal, 78.30 protein
    // linguine 200g -> 742.00 kcal, 26.00 protein
    // pepper 300g   ->  93.00 kcal,  3.00 protein
    // olive oil 27.6g -> 243.98 kcal, 0 protein
    // total 1496.58 kcal / 2 servings = 748.29 -> 748
    expect(result.perServing.calories).toBe(748);
    expect(result.perServing.protein).toBeCloseTo(53.7, 1);
    expect(result.servings).toBe(2);
  });

  it('gives the same numbers on every run', async () => {
    const runs = await Promise.all([
      analyse(recipe, options),
      analyse(recipe, options),
      analyse(recipe, options),
    ]);

    expect(runs[1].perServing).toEqual(runs[0].perServing);
    expect(runs[2].perServing).toEqual(runs[0].perServing);
  });

  it('records where every number came from', async () => {
    const result = await analyse(recipe, options);

    expect(result.items).toHaveLength(4);
    for (const item of result.items) {
      expect(item.source).toBe('usda');
      expect(item.matchedAs).toBeTruthy();
      expect(item.grams).toBeGreaterThan(0);
    }
  });

  it('says what it assumed to get a mass, and stays quiet when it assumed nothing', async () => {
    const result = await analyse(recipe, options);
    const by = Object.fromEntries(result.items.map(i => [i.ingredient, i.assumption]));

    // A count needed a typical weight, so the reader is told which one.
    expect(by['chicken breast']).toMatch(/174g/);
    expect(by['bell pepper']).toMatch(/150g/);
    // 200g is 200g. Nothing was assumed, so nothing is claimed.
    expect(by.linguine).toBeUndefined();
  });

  it('reports an unresolved ingredient instead of absorbing it', async () => {
    const result = await analyse(
      { servings: 2, ingredients: [...recipe.ingredients, { name: 'harissa', amount: 2, unit: 'tbsp' }] },
      options
    );

    const harissa = result.items.find(i => i.ingredient === 'harissa');
    expect(harissa?.source).toBe('unresolved');
    // And the totals are unchanged, because it contributed nothing.
    expect(result.perServing.calories).toBe(748);
    // Which the confidence has to say, or the gap is invisible.
    expect(result.confidence).toBe('low');
  });

  it('is high-confidence only when everything resolved from a database', async () => {
    const result = await analyse(recipe, options);
    expect(result.confidence).toBe('high');
  });

  it('divides by servings rather than reporting the whole pan', async () => {
    const forFour = await analyse({ ...recipe, servings: 4 }, options);
    const forTwo = await analyse(recipe, options);

    expect(forFour.perServing.calories).toBeCloseTo(forTwo.perServing.calories / 2, 0);
  });

  it('never divides by zero, whatever the draft claimed', async () => {
    const result = await analyse({ ...recipe, servings: 0 }, options);
    expect(Number.isFinite(result.perServing.calories)).toBe(true);
    expect(result.servings).toBe(1);
  });
});

describe('staples and things that are not eaten', () => {
  /**
   * Both of these came out of the first real end-to-end run, which produced a
   * pasta dish reporting 5g of fat per serving: olive oil and butter resolved
   * to nothing through a name search, and four cups of drained pasta water was
   * counted as an ingredient.
   */
  const empty = { lookup: async () => null };

  it('resolves staples with no database at all', async () => {
    const result = await analyse(
      {
        servings: 1,
        ingredients: [
          { name: 'olive oil', amount: 2, unit: 'tbsp' },
          { name: 'butter', amount: 1, unit: 'tbsp' },
        ],
      },
      { foods: empty, allowModelWeights: false }
    );

    // 27.6g of oil at 100% fat, plus 13.7g of butter at 81.1%.
    expect(result.perServing.fat).toBeCloseTo(38.7, 0);
    expect(result.confidence).toBe('high');
    expect(result.items.every(i => i.source === 'usda')).toBe(true);
  });

  it('excludes water the dish is drained of, and says it did', async () => {
    const result = await analyse(
      {
        servings: 2,
        ingredients: [
          { name: 'linguine', amount: 200, unit: 'g' },
          { name: 'water', amount: 4, unit: 'cup' },
        ],
      },
      { foods: fixtureFoodDatabase, allowModelWeights: false }
    );

    const water = result.items.find(i => i.ingredient === 'water');
    expect(water?.source).toBe('excluded');
    // Excluded is not a gap, so it must not drag the confidence down.
    expect(result.confidence).toBe('high');
    // 200g of linguine at 371 kcal/100g over two servings.
    expect(result.perServing.calories).toBe(371);
  });

  it('does not let the black-pepper staple swallow a bell pepper', async () => {
    expect(stapleMacros('black pepper')?.matchedAs).toMatch(/pepper, black/i);
    expect(stapleMacros('bell pepper')).toBeNull();
    expect(stapleMacros('olive oil')?.macros.fat).toBe(100);
    expect(stapleMacros('chicken breast')).toBeNull();
  });
});

describe('normaliseFoodKey', () => {
  it('collapses the spellings that should share a cache entry', () => {
    expect(normaliseFoodKey('  Chicken Breasts ')).toBe('chicken breast');
    expect(normaliseFoodKey('Bell Peppers')).toBe('bell pepper');
    expect(normaliseFoodKey('extra-virgin olive oil')).toBe('extra virgin olive oil');
  });
});
