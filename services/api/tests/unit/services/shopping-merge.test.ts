import {
  addQuantities,
  ingredientKey,
} from '@petra/food-measures';

import {
  combine,
  dedupeItems,
  joinRecipes,
  lineKey,
  mergeInto,
} from '../../../src/services/shopping-merge';

const line = (
  name: string,
  quantity: number,
  unit: string,
  recipeName?: string
) => ({
  name,
  quantity,
  unit,
  recipeName,
});

describe('ingredientKey', () => {
  it('treats spelling, case, plurals and preparation as the same item', () => {
    expect(ingredientKey('Manchego')).toBe(ingredientKey('manchego'));
    expect(ingredientKey('Melted Butter')).toBe(ingredientKey('butter'));
    expect(ingredientKey('Lemons')).toBe(ingredientKey('lemon'));
    expect(ingredientKey('Spinach (fresh)')).toBe(ingredientKey('spinach'));
  });

  it('keeps genuinely different things apart', () => {
    expect(ingredientKey('Lemon')).not.toBe(ingredientKey('Lemon Juice'));
    expect(ingredientKey('Lime')).not.toBe(ingredientKey('Lemon'));
  });
});

describe('lineKey', () => {
  it('keeps a spooned line apart from a whole one of the same name', () => {
    // Bell peppers and black pepper; whole onions and onion granules.
    expect(lineKey(line('Pepper', 6, ''))).not.toBe(
      lineKey(line('Pepper', 0.5, 'tsp'))
    );
    expect(lineKey(line('Onion', 38, ''))).not.toBe(
      lineKey(line('Onion', 4, 'tablespoons'))
    );
  });

  it('puts weights, liquids, cups and counts of one item together', () => {
    const milk = lineKey(line('Milk', 800, 'ml'));
    expect(lineKey(line('Milk', 700, 'g'))).toBe(milk);
    expect(lineKey(line('milk', 2, 'cup'))).toBe(milk);
  });
});

describe('addQuantities', () => {
  it('keeps spoons as spoons', () => {
    // 2 tbsp + 4 tsp = 10 tsp ≈ 3.5 tbsp
    expect(
      addQuantities(
        'lemon juice',
        { quantity: 2, unit: 'tablespoon' },
        { quantity: 4, unit: 'tsp' }
      )
    ).toEqual({ quantity: 3.5, unit: 'tbsp' });
    expect(
      addQuantities(
        'nutmeg',
        { quantity: 1, unit: 'teaspoon' },
        { quantity: 1, unit: 'tsp' }
      )
    ).toEqual({
      quantity: 2,
      unit: 'tsp',
    });
  });

  it('adds masses and moves to kg past a kilo', () => {
    expect(
      addQuantities(
        'flour',
        { quantity: 800, unit: 'g' },
        { quantity: 0.5, unit: 'kg' }
      )
    ).toEqual({
      quantity: 1.3,
      unit: 'kg',
    });
  });

  it('adds bare counts however they are spelled, and singular/plural units', () => {
    expect(
      addQuantities(
        'lemon',
        { quantity: 2, unit: 'pcs' },
        { quantity: 1, unit: '' }
      )
    ).toEqual({
      quantity: 3,
      unit: 'pcs',
    });
    expect(
      addQuantities(
        'garlic',
        { quantity: 70, unit: 'cloves' },
        { quantity: 6, unit: 'clove' }
      )
    ).toEqual({
      quantity: 76,
      unit: 'cloves',
    });
  });

  it('meets in grams when a liquid and a weight are mixed', () => {
    const sum = addQuantities(
      'milk',
      { quantity: 800, unit: 'ml' },
      { quantity: 700, unit: 'g' }
    );
    expect(sum.unit).toBe('kg');
    expect(sum.extra).toBeUndefined();
  });

  it('keeps whole-item units rather than converting them to grams', () => {
    // 24 garlic and 76 cloves: both true, neither is "228 g".
    expect(
      addQuantities(
        'garlic',
        { quantity: 24, unit: '' },
        { quantity: 76, unit: 'cloves' }
      )
    ).toEqual({ quantity: 24, unit: '', extra: '76 cloves' });
    expect(
      addQuantities(
        'spring onion',
        { quantity: 8, unit: '' },
        { quantity: 8, unit: 'bunch' }
      )
    ).toMatchObject({ quantity: 8, extra: '8 bunch' });
  });
});

describe('joinRecipes', () => {
  it('lists each recipe once', () => {
    expect(joinRecipes('Fish pie, Flamiche', 'Flamiche')).toBe(
      'Fish pie, Flamiche'
    );
    expect(joinRecipes(null, undefined)).toBeNull();
  });
});

describe('mergeInto', () => {
  it('tops up the existing row, lists both recipes and un-ticks it', () => {
    const merged = mergeInto(
      {
        ...line('Nutmeg', 1, 'teaspoon', 'Flamiche'),
        isCompleted: true,
        notes: null,
      },
      line('nutmeg', 1, 'tsp', 'Fish pie')
    );
    expect(merged).toMatchObject({
      name: 'Nutmeg',
      quantity: 2,
      unit: 'tsp',
      recipeName: 'Flamiche, Fish pie',
      isCompleted: false,
    });
  });

  it('keeps a quantity it cannot add as a note, naming the recipe', () => {
    const merged = mergeInto(
      { ...line('Garlic', 24, '', 'Flamiche'), notes: null },
      line('Garlic', 76, 'cloves', 'Croquetas')
    );
    expect(merged).toMatchObject({ quantity: 24, notes: 'Also 76 cloves' });
  });
});

describe('combine', () => {
  it('does not depend on which line comes first', () => {
    const lines = [
      line('Butter', 2, ''),
      line('Butter', 4, 'oz'),
      line('Butter', 1840, 'g'),
      line('Melted Butter', 1320, 'g'),
      line('Unsalted Butter', 250, 'g'),
    ];
    const a = combine(lines);
    const b = combine([...lines].reverse());
    // Weights are the main quantity; the bare count is kept as a note.
    expect(a.unit).toBe('kg');
    expect(a.quantity).toBeCloseTo(3.52, 1);
    expect(b.quantity).toBeCloseTo(a.quantity, 5);
  });

  it('keeps earlier notes when topping up a row', () => {
    const row = { ...line('Garlic', 24, ''), notes: 'Also 76 cloves' };
    const more = combine([row, line('Garlic', 6, '')]);
    expect(more).toMatchObject({ quantity: 30, notes: 'Also 76 cloves' });
  });
});

describe('dedupeItems', () => {
  it('collapses the screenshot’s duplicates and leaves different products apart', () => {
    const out = dedupeItems([
      line('Milk', 800, 'ml', 'Chicken Ham and Leek Pie'),
      line('Milk', 700, 'g', 'Jamon & wild garlic croquetas'),
      line('Milk', 2, 'cup', 'Home-made Mandazi'),
      line('Lemon Juice', 2, 'tablespoon', 'Noodle bowl salad'),
      line('Lemon Juice', 4, 'tsp', 'Eggs Benedict'),
      line('Lemon', 14, '', 'Fish pie'),
      line('Pepper', 6, '', 'Stuffed peppers'),
      line('Pepper', 0.5, 'tsp', 'Fish pie'),
    ]);
    expect(out.map(i => `${i.name} ${i.quantity} ${i.unit}`.trim())).toEqual([
      expect.stringMatching(/^Milk [\d.]+ kg$/),
      'Lemon Juice 3.5 tbsp',
      'Lemon 14',
      'Pepper 6',
      'Pepper 0.5 tsp',
    ]);
    expect(out[0].recipeName).toBe(
      'Chicken Ham and Leek Pie, Jamon & wild garlic croquetas, Home-made Mandazi'
    );
  });
});
