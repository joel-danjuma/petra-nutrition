import { deriveConstraints } from '../src/graph/constraints';
import { validateGeneratedRecipe, validateNutrition } from '../src/graph/validate';

/**
 * The validator, which is where "the model said so" stops being good enough.
 *
 * Mirrors the existing plausibility tests around `validateEnrichment`, and
 * takes the same posture: reject, don't repair. A repair pass has to decide
 * what the model *meant*, and a wrong guess about an ingredient list is exactly
 * the kind of confident error that reaches a screen.
 */

const context = {
  currentPantryItems: [],
  pantryNames: ['onion', 'garlic'],
  dietaryRestrictions: [],
  healthGoals: [],
  allergies: [],
} as never;

const constraints = deriveConstraints(context, ['chicken breast', 'linguine', 'bell pepper'], 2);

/** A recipe that passes, so each test can break exactly one thing. */
const valid = () => ({
  title: 'Chicken Linguine',
  servings: 2,
  prepTime: 10,
  cookTime: 15,
  difficulty: 'EASY',
  ingredients: [
    { name: 'chicken breast', amount: 2, unit: 'whole' },
    { name: 'linguine', amount: 200, unit: 'g' },
    { name: 'olive oil', amount: 1, unit: 'tbsp' },
  ],
  instructions: [
    { step: 1, instruction: 'Boil the linguine in well-salted water until just tender.' },
    { step: 2, instruction: 'Sear the chicken breast in the olive oil until golden through.' },
    { step: 3, instruction: 'Toss the drained pasta through the pan with a splash of its water.' },
  ],
});

const kinds = (raw: unknown) => {
  const result = validateGeneratedRecipe(raw, constraints);
  return result.ok ? [] : result.failures.map(f => f.kind);
};

describe('validateGeneratedRecipe', () => {
  it('accepts a recipe inside the allowed set', () => {
    const result = validateGeneratedRecipe(valid(), constraints);
    expect(result.ok).toBe(true);
  });

  it('rejects an ingredient outside the allowed set', () => {
    const recipe = valid();
    recipe.ingredients.push({ name: 'double cream', amount: 100, unit: 'ml' });
    recipe.instructions.push({ step: 4, instruction: 'Stir the double cream through off the heat.' });

    expect(kinds(recipe)).toContain('out-of-set-ingredient');
  });

  it('names the offending words, so the retry can act on them', () => {
    const recipe = valid();
    recipe.ingredients.push({ name: 'double cream', amount: 100, unit: 'ml' });

    const result = validateGeneratedRecipe(recipe, constraints);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures.some(f => /double|cream/.test(f.message))).toBe(true);
  });

  it('rejects a step calling for an ingredient that is not listed', () => {
    const recipe = valid();
    recipe.instructions.push({
      step: 4,
      instruction: 'Finish with a generous handful of grated parmesan and a squeeze of lemon.',
    });

    expect(kinds(recipe)).toContain('phantom-ingredient');
  });

  it('allows a step to call pasta by its category', () => {
    // "reserve a cup of the starchy pasta water" is correct prose for a recipe
    // whose ingredient list says linguine. Rejecting it would degrade the
    // failing case this whole graph exists to fix.
    const recipe = valid();
    recipe.instructions[2].instruction =
      'Reserve a mugful of the starchy pasta water, then toss everything together.';

    expect(validateGeneratedRecipe(recipe, constraints).ok).toBe(true);
  });

  it('rejects an ingredient the method never uses', () => {
    const recipe = valid();
    recipe.ingredients.push({ name: 'bell pepper', amount: 2, unit: 'whole' });

    expect(kinds(recipe)).toContain('unused-ingredient');
  });

  it('rejects an unreadable quantity', () => {
    const recipe = valid();
    recipe.ingredients[1] = { name: 'linguine', amount: 0, unit: '' };

    expect(kinds(recipe)).toContain('bad-quantity');
  });

  it('rejects a method with fewer than two steps', () => {
    const recipe = valid();
    recipe.instructions = [recipe.instructions[0]];

    expect(kinds(recipe)).toContain('bad-steps');
  });

  it('renumbers steps from one, contiguously', () => {
    const recipe = valid();
    recipe.instructions = recipe.instructions.map((s, i) => ({ ...s, step: (i + 1) * 10 }));

    const result = validateGeneratedRecipe(recipe, constraints);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recipe.instructions.map(s => s.step)).toEqual([1, 2, 3]);
  });

  it('rejects an implausible yield', () => {
    expect(kinds({ ...valid(), servings: 40 })).toContain('bad-yield');
    expect(kinds({ ...valid(), servings: 2.5 })).toContain('bad-yield');
  });

  it('rejects anything that is not an object', () => {
    expect(kinds('a lovely pasta dish')).toContain('malformed');
    expect(kinds(null)).toContain('malformed');
    expect(kinds([valid()])).toContain('malformed');
  });

  it('marks staples so they are never presented as shopping', () => {
    const result = validateGeneratedRecipe(valid(), constraints);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const byName = Object.fromEntries(result.recipe.ingredients.map(i => [i.name, i.staple]));
    expect(byName['olive oil']).toBe(true);
    expect(byName['chicken breast']).toBe(false);
  });
});

describe('validateNutrition', () => {
  it('accepts a plausible dish', () => {
    expect(validateNutrition({ calories: 620, protein: 45, carbs: 68, fat: 18 })).toEqual([]);
  });

  it('rejects macros outside the same bounds enrichment uses', () => {
    expect(validateNutrition({ calories: 9000, protein: 45, carbs: 68, fat: 18 })).toHaveLength(1);
    expect(validateNutrition({ calories: 600, protein: 900, carbs: 68, fat: 18 })).toHaveLength(1);
  });

  it('reports a missing macro rather than defaulting it to zero', () => {
    const failures = validateNutrition({
      calories: 600,
      protein: Number.NaN,
      carbs: 68,
      fat: 18,
    });
    expect(failures.map(f => f.message)).toContain('Missing protein.');
  });
});
