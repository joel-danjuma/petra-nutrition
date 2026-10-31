import {
  clampStep,
  formatTimer,
  ingredientsForStep,
  splitStep,
} from '../src/utils/cook';

describe('formatTimer', () => {
  it.each([
    [0, '0:00'],
    [9, '0:09'],
    [90, '1:30'],
    [605, '10:05'],
    [-5, '0:00'],
  ])('%p s → %s', (s, out) => expect(formatTimer(s)).toBe(out));
});

describe('clampStep', () => {
  it('keeps the index inside the recipe', () => {
    expect(clampStep(-1, 6)).toBe(0);
    expect(clampStep(9, 6)).toBe(5);
    expect(clampStep(3, 6)).toBe(3);
    expect(clampStep(2, 0)).toBe(0);
  });
});

describe('splitStep', () => {
  it('uses the first sentence as the title', () => {
    expect(
      splitStep(
        'Soften the garlic. Warm two tablespoons of oil and add the sliced garlic.'
      )
    ).toEqual({
      title: 'Soften the garlic',
      body: 'Warm two tablespoons of oil and add the sliced garlic.',
    });
  });

  it('keeps a one-sentence step whole', () => {
    expect(splitStep('Stir in the greens and let them wilt.')).toEqual({
      title: 'Stir in the greens and let them wilt.',
      body: null,
    });
  });

  it('does not split on a very long first sentence', () => {
    const long = `${'Simmer gently '.repeat(8)}until thick. Then serve.`;
    expect(splitStep(long).body).toBeNull();
  });
});

describe('ingredientsForStep', () => {
  const ings = [
    { name: 'Olive oil' },
    { name: 'Garlic cloves' },
    { name: 'Tinned tomatoes' },
    { name: 'Eggs' },
    { name: 'Greens' },
  ];

  it('finds the ingredients a step mentions, in recipe order', () => {
    expect(
      ingredientsForStep(
        'Warm the oil and soften the garlic for a minute.',
        ings
      ).map(i => i.name)
    ).toEqual(['Olive oil', 'Garlic cloves']);
    expect(
      ingredientsForStep('Add the tomatoes and simmer.', ings).map(i => i.name)
    ).toEqual(['Tinned tomatoes']);
    expect(
      ingredientsForStep('Crack an egg into each well.', ings).map(i => i.name)
    ).toEqual(['Eggs']);
  });

  it('returns nothing for a step with no ingredients', () => {
    expect(ingredientsForStep('Serve straight from the pan.', ings)).toEqual(
      []
    );
  });
});
