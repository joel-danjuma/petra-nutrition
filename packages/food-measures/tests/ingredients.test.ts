import {
  STAPLES,
  addQuantities,
  covers,
  estimateGrams,
  ingredientKey,
  ingredientWords,
  isStaple,
  sameIngredient,
  singular,
  sqlTermPattern,
  subtractQuantity,
  unitFamily,
} from '../src';

/**
 * Ingredient identity and quantity arithmetic: the one rule both services and
 * both apps now ask.
 *
 * The matrix below is the architecture review's. Every row was a place where
 * two of the nine old normalisers gave different answers to the same question,
 * so each is asserted against the one rule that replaced them.
 */

describe('singular', () => {
  it.each([
    ['apples', 'apple'],
    ['tomatoes', 'tomato'],
    ['anchovies', 'anchovy'],
    ['berries', 'berry'],
    ['peaches', 'peach'],
    ['radishes', 'radish'],
    ['boxes', 'box'],
    ['sausages', 'sausage'],
    ['cheeses', 'cheese'],
    ['olives', 'olive'],
    ['chillies', 'chilli'],
    ['leaves', 'leaf'],
    ['peas', 'pea'],
    ['glass', 'glass'],
    ['couscous', 'couscous'],
    ['asparagus', 'asparagus'],
    ['bass', 'bass'],
  ])('%s → %s', (plural, one) => expect(singular(plural)).toBe(one));
});

describe('ingredientWords', () => {
  it.each([
    ['2 large free-range Eggs', ['egg']],
    ['Tinned tomatoes', ['tinned', 'tomato']],
    ['Garlic cloves, crushed', ['garlic']],
    ['Spinach (fresh)', ['spinach']],
    ['Extra virgin olive oil', ['olive', 'oil']],
    ['to taste', []],
  ])('%s → %p', (name, words) => expect(ingredientWords(name)).toEqual(words));
});

describe('sameIngredient and covers — the review matrix', () => {
  it.each([
    // [pantry or first name, ingredient or second name, same, covers]
    ['Apples', 'apple', true, true],
    ['Olive oil', 'sesame oil', false, false],
    ['Unsalted butter', 'butter', true, true],
    ['Garlic', 'garlic cloves', true, true],
    ['Olive oil', 'extra virgin olive oil', true, true],
    ['Tinned tomatoes', 'tomatoes', false, false],
    ['Tomatoes', 'tinned tomatoes', false, true],
    ['Tomato puree', 'tomatoes', false, false],
    ['Greek yoghurt', 'greek salad', false, false],
    ['Lemon', 'lemon juice', false, true],
    ['Garlic powder', 'garlic', false, false],
    ['Dried basil', 'fresh basil', false, false],
  ])('%s / %s', (a, b, same, covered) => {
    expect(sameIngredient(a, b)).toBe(same);
    expect(covers(a, b)).toBe(covered);
  });

  it('never covers on an empty or descriptor-only pantry name', () => {
    expect(covers('to taste', 'salt')).toBe(false);
    expect(covers('', 'salt')).toBe(false);
  });

  it('keys a descriptor-only name as itself rather than as nothing', () => {
    expect(ingredientKey('To taste')).toBe('to taste');
    expect(sameIngredient('to taste', 'as needed')).toBe(false);
  });
});

describe('synonyms', () => {
  it.each([
    ['scallions', 'spring onion'],
    ['green onions', 'spring onions'],
    ['zucchini', 'courgette'],
    ['eggplant', 'aubergine'],
    ['cilantro', 'coriander'],
    ['red chili', 'red chillies'],
    ['Greek yogurt', 'greek yoghurt'],
    ['garbanzo beans', 'chickpeas'],
    ['chick peas', 'chickpea'],
  ])('%s is %s', (a, b) => {
    expect(sameIngredient(a, b)).toBe(true);
    expect(covers(a, b)).toBe(true);
  });
});

describe('isStaple', () => {
  it.each([
    'salt',
    'sea salt',
    'flaky sea salt',
    'olive oil',
    'extra virgin olive oil',
    'oil',
    'butter',
    'unsalted butter',
    'black pepper',
    'freshly ground black pepper',
    'dried oregano',
    'bay leaves',
    'chilli flakes',
    'garlic powder',
    'plain flour',
    'water',
  ])('%s is a staple', name => expect(isStaple(name)).toBe(true));

  it.each([
    // The three the old token-subset test got wrong.
    'garlic',
    'fresh basil',
    'red pepper',
    // And the ones it got right, which must stay right.
    'peanut butter',
    'bell pepper',
    'sesame oil',
    'olives',
    'chicken breast',
    'to taste',
    '',
  ])('%p is not a staple', name => expect(isStaple(name)).toBe(false));

  it('is true of every name on the list', () => {
    for (const staple of STAPLES) expect(isStaple(staple)).toBe(true);
  });
});

describe('sqlTermPattern', () => {
  const asJs = (pattern: string) =>
    new RegExp(pattern.replace(/\\y/g, '\\b'), 'i');

  it('emits the singular and plural of each term', () => {
    expect(sqlTermPattern(['apple'])).toBe('\\y(apple|apples)\\y');
    expect(sqlTermPattern(['Apples'])).toBe('\\y(apple|apples)\\y');
  });

  it('matches the -es and -ies plurals the old `s?` suffix missed', () => {
    const fish = asJs(sqlTermPattern(['anchovy']) as string);
    expect(fish.test('Anchovies in oil')).toBe(true);
    expect(fish.test('anchovy fillets')).toBe(true);
    expect(asJs(sqlTermPattern(['peach']) as string).test('Peaches')).toBe(
      true
    );
    expect(asJs(sqlTermPattern(['tomato']) as string).test('tomatoes')).toBe(
      true
    );
  });

  it('matches whole words only', () => {
    const nut = asJs(sqlTermPattern(['nut']) as string);
    expect(nut.test('Mixed nuts')).toBe(true);
    expect(nut.test('Butternut squash')).toBe(false);
  });

  it('spells out synonyms and phrases', () => {
    const onion = asJs(sqlTermPattern(['spring onion']) as string);
    for (const name of ['Scallions', 'green onion', 'Spring onions']) {
      expect(onion.test(name)).toBe(true);
    }
    expect(onion.test('red onion')).toBe(false);
  });

  it('is null when there is nothing to match', () => {
    expect(sqlTermPattern([])).toBeNull();
    expect(sqlTermPattern(['  '])).toBeNull();
  });

  it('escapes regex syntax', () => {
    expect(sqlTermPattern(['c++'])).toContain('c\\+\\+');
  });
});

describe('quantities', () => {
  it('knows every spelling of a unit', () => {
    expect(unitFamily('kilograms')).toBe('mass');
    expect(unitFamily('Ounce')).toBe('mass');
    expect(unitFamily('pounds')).toBe('mass');
    expect(unitFamily('millilitre')).toBe('volume');
    expect(unitFamily('fl oz')).toBe('volume');
    expect(unitFamily('Tbsp.')).toBe('spoon');
    expect(unitFamily('pcs')).toBe('count');
    expect(unitFamily('cloves')).toBe('other');
  });

  it('subtracts across units in one family: 1.3 kg − 500 g = 800 g', () => {
    expect(
      subtractQuantity({ quantity: 1.3, unit: 'kg' }, { quantity: 500, unit: 'g' })
    ).toEqual({ quantity: 800, unit: 'g' });
    expect(
      subtractQuantity(
        { quantity: 2, unit: 'tbsp' },
        { quantity: 1, unit: 'tsp' }
      )
    ).toEqual({ quantity: 1.5, unit: 'tbsp' });
    expect(
      subtractQuantity({ quantity: 6, unit: '' }, { quantity: 2, unit: 'pcs' })
    ).toEqual({ quantity: 4, unit: 'pcs' });
  });

  it('never goes below zero', () => {
    expect(
      subtractQuantity({ quantity: 200, unit: 'g' }, { quantity: 1, unit: 'kg' })
    ).toEqual({ quantity: 0, unit: 'g' });
  });

  it('is incomparable across families with no common scale', () => {
    expect(
      subtractQuantity({ quantity: 400, unit: 'g' }, { quantity: 2, unit: 'tins' })
    ).toBe('incomparable');
    expect(
      subtractQuantity({ quantity: 3, unit: 'cloves' }, { quantity: 1, unit: '' })
    ).toBe('incomparable');
    expect(
      subtractQuantity({ quantity: 2, unit: 'tbsp' }, { quantity: 1, unit: 'kg' })
    ).toBe('incomparable');
  });

  it('meets a weight and a liquid in grams when the item is named', () => {
    expect(
      subtractQuantity(
        { quantity: 1, unit: 'l' },
        { quantity: 400, unit: 'g' },
        'milk'
      )
    ).toEqual({ quantity: 600, unit: 'g' });
  });

  it('adds with the same rules it subtracts with', () => {
    expect(
      addQuantities('flour', { quantity: 800, unit: 'g' }, { quantity: 0.5, unit: 'kg' })
    ).toEqual({ quantity: 1.3, unit: 'kg' });
    expect(
      addQuantities('garlic', { quantity: 24, unit: '' }, { quantity: 76, unit: 'cloves' })
    ).toEqual({ quantity: 24, unit: '', extra: '76 cloves' });
  });

  it('estimates grams, or says it cannot', () => {
    expect(estimateGrams('flour', 1, 'kilogram')).toBe(1000);
    expect(estimateGrams('water', 250, 'ml')).toBe(250);
    expect(estimateGrams('onion', 2, '')).toBe(300);
    expect(estimateGrams('mystery', 1, 'sachet')).toBeNull();
  });
});
