import {
  describeQuantity,
  findInPantry,
  matchRecipeToPantry,
} from '../../../src/services/pantry-match';

const item = (name: string, quantity = 1, unit = 'pcs') => ({
  name,
  quantity,
  unit,
});

describe('findInPantry', () => {
  const pantry = [
    item('Garlic', 1, 'bulb'),
    item('Tinned tomatoes', 3, 'tins'),
    item('Greek yoghurt', 300, 'g'),
    item('Olive oil', 250, 'ml'),
  ];

  it('matches an ingredient described more specifically than the pantry item', () => {
    expect(findInPantry('garlic cloves, minced', pantry)?.name).toBe('Garlic');
    expect(findInPantry('extra virgin olive oil', pantry)?.name).toBe(
      'Olive oil'
    );
  });

  it('matches the same thing named the same way', () => {
    expect(findInPantry('tinned tomatoes', pantry)?.name).toBe(
      'Tinned tomatoes'
    );
  });

  it('does not let a more specific pantry item stand in for a general ingredient', () => {
    // Tinned is not the fresh tomatoes a salad wants.
    expect(findInPantry('tomatoes', pantry)).toBeNull();
    expect(findInPantry('tomatoes', [item('Tomato puree')])).toBeNull();
  });

  it('does not match on one shared word when both have others', () => {
    // "Greek yoghurt" must not cover "greek salad".
    expect(findInPantry('greek salad', pantry)).toBeNull();
    // "Olive oil" must not cover "sesame oil".
    expect(findInPantry('sesame oil', pantry)).toBeNull();
  });

  it('prefers the closest name when several cover it', () => {
    const p = [item('Oil'), item('Olive oil')];
    expect(findInPantry('extra virgin olive oil', p)?.name).toBe('Olive oil');
  });

  it('returns null for an empty or descriptor-only ingredient', () => {
    expect(findInPantry('to taste', pantry)).toBeNull();
  });

  it('ignores preparation words, so unsalted butter covers butter', () => {
    // A deliberate change: "unsalted" used to count as part of the name, so
    // the butter in the fridge did not cover a recipe's "butter". It is how
    // the butter is made, not what it is. Form words still count — see the
    // tinned tomatoes above.
    expect(findInPantry('butter', [item('Unsalted butter')])?.name).toBe(
      'Unsalted butter'
    );
  });

  it('matches plurals and synonyms', () => {
    expect(findInPantry('apple', [item('Apples')])?.name).toBe('Apples');
    expect(findInPantry('2 courgettes', [item('Zucchini')])?.name).toBe(
      'Zucchini'
    );
  });
});

describe('describeQuantity', () => {
  it('prints whole numbers bare and rounds the rest', () => {
    expect(describeQuantity({ quantity: 3, unit: 'tins' })).toBe('3 tins');
    expect(describeQuantity({ quantity: 1.25, unit: 'kg' })).toBe('1.3 kg');
  });
});

describe('matchRecipeToPantry', () => {
  const NOW = new Date(2026, 2, 24, 20, 0);
  const pantry = [
    {
      id: 'p1',
      name: 'Greens',
      quantity: 150,
      unit: 'g',
      expirationDate: new Date(2026, 2, 26),
    },
    {
      id: 'p2',
      name: 'Eggs',
      quantity: 6,
      unit: 'pcs',
      expirationDate: new Date(2026, 2, 29),
    },
    {
      id: 'p3',
      name: 'Garlic',
      quantity: 1,
      unit: 'bulb',
      expirationDate: null,
    },
  ];
  const ingredients = [
    { id: 'i1', name: 'Greens' },
    { id: 'i2', name: 'Free-range eggs' },
    { id: 'i3', name: 'Garlic cloves' },
    { id: 'i4', name: 'Flat-leaf parsley' },
  ];

  it('marks each ingredient have, use-soon or missing, and counts what to buy and clears', () => {
    const m = matchRecipeToPantry(ingredients, pantry, NOW);
    expect(
      m.ingredients.map(i => [i.ingredientId, i.status, i.daysLeft])
    ).toEqual([
      ['i1', 'use-soon', 2],
      ['i2', 'have', 5],
      ['i3', 'have', null],
      ['i4', 'missing', null],
    ]);
    expect(m.toBuy).toBe(1);
    expect(m.clears).toBe(1);
    expect(m.ingredients[0].have).toBe('150 g');
  });

  it('treats a staple as had even when the pantry does not record it', () => {
    const m = matchRecipeToPantry(
      [
        { id: 's1', name: 'Salt' },
        { id: 's2', name: 'Extra virgin olive oil' },
        { id: 's3', name: 'Garlic powder' },
        { id: 'n1', name: 'Fresh basil' },
      ],
      pantry,
      NOW
    );
    expect(m.ingredients.map(i => [i.ingredientId, i.status])).toEqual([
      ['s1', 'have'],
      ['s2', 'have'],
      ['s3', 'have'],
      ['n1', 'missing'],
    ]);
    expect(m.toBuy).toBe(1);
  });

  it('counts a pantry item once however many ingredients use it', () => {
    const m = matchRecipeToPantry(
      [
        { id: 'a', name: 'Greens' },
        { id: 'b', name: 'Greens' },
      ],
      pantry,
      NOW
    );
    expect(m.clears).toBe(1);
  });
});
