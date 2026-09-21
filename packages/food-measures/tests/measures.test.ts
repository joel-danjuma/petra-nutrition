import { parseMeasure, toGrams, unitWeightFor } from '../src';

/**
 * The measure parser, which both services now depend on.
 *
 * The cases here are the ones that actually appear in the corpus — TheMealDB
 * measures are free text, and every shape below was taken from real rows. The
 * ones worth keeping an eye on are the glued unit ("800g") and the qualitative
 * measure ("Dash"), because both used to come back as a bare `1` and silently
 * meant something different.
 */

describe('parseMeasure', () => {
  it.each([
    ['800g', 800, 'g'],
    ['1 kg', 1, 'kg'],
    ['250 ml', 250, 'ml'],
    ['2 tablespoons', 2, 'tablespoons'],
    ['1 tbsp', 1, 'tbsp'],
    ['3 cloves', 3, 'cloves'],
    ['1 1/2 tbsp', 1.5, 'tbsp'],
    ['1/2 cup', 0.5, 'cup'],
    ['½ cup', 0.5, 'cup'],
    ['¾ tsp', 0.75, 'tsp'],
  ])('reads %s', (raw, amount, unit) => {
    const parsed = parseMeasure(raw);
    expect(parsed.amount).toBeCloseTo(amount, 5);
    expect(parsed.unit).toBe(unit);
    expect(parsed.quantified).toBe(true);
  });

  it('keeps preparation detail as a note rather than dropping it', () => {
    const parsed = parseMeasure('1 small finely diced');
    expect(parsed.amount).toBe(1);
    expect(parsed.unit).toBe('');
    expect(parsed.notes).toBe('small finely diced');
  });

  it('flags a qualitative measure instead of pretending it is one of something', () => {
    for (const raw of ['Dash', 'To taste', 'Pinch']) {
      const parsed = parseMeasure(raw);
      expect(parsed.quantified).toBe(false);
      expect(parsed.notes).toBe(raw);
    }
  });

  it('treats an empty measure as unquantified', () => {
    expect(parseMeasure('').quantified).toBe(false);
    expect(parseMeasure('   ').quantified).toBe(false);
  });
});

describe('toGrams', () => {
  it('converts mass exactly', () => {
    expect(toGrams('linguine', 200, 'g')).toEqual({ grams: 200, basis: 'mass' });
    expect(toGrams('flour', 1, 'kg')).toEqual({ grams: 1000, basis: 'mass' });
    expect(toGrams('butter', 1, 'oz').grams).toBeCloseTo(28.3495, 4);
  });

  it('uses a density for volume, not water', () => {
    // A cup of flour at 1 g/ml would be 240g rather than ~127g — nearly double
    // the carbohydrate, which is worse than showing no macros at all.
    const flour = toGrams('plain flour', 1, 'cup');
    expect(flour.basis).toBe('volume');
    expect(flour.grams).toBeCloseTo(127.2, 1);
    expect(flour.assumption).toMatch(/0\.53 g\/ml/);

    expect(toGrams('water', 1, 'cup').grams).toBe(240);
    expect(toGrams('olive oil', 1, 'tbsp').grams).toBeCloseTo(13.8, 4);
  });

  it('uses the weight table for a bare count', () => {
    const chicken = toGrams('chicken breast', 2, 'whole');
    expect(chicken.basis).toBe('count');
    expect(chicken.grams).toBe(348);
    expect(chicken.assumption).toMatch(/174g/);

    expect(toGrams('garlic', 3, 'cloves').grams).toBe(9);
    expect(toGrams('eggs', 2, '').grams).toBe(100);
  });

  it('reports unresolved rather than guessing', () => {
    expect(toGrams('dragon fruit', 2, 'whole')).toEqual({ grams: null, basis: 'unresolved' });
    expect(toGrams('linguine', 0, 'g')).toEqual({ grams: null, basis: 'unresolved' });
    expect(toGrams('linguine', Number.NaN, 'g')).toEqual({ grams: null, basis: 'unresolved' });
  });
});

describe('unitWeightFor', () => {
  it('prefers the longest match, so a cut beats its animal', () => {
    expect(unitWeightFor('chicken breast')?.key).toBe('chicken breast');
    expect(unitWeightFor('chicken thigh')?.key).toBe('chicken thigh');
    expect(unitWeightFor('cherry tomato')?.key).toBe('cherry tomato');
  });

  it('returns null for something it does not know', () => {
    expect(unitWeightFor('romanesco')).toBeNull();
  });
});
