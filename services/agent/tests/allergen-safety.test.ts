import { MemorySaver } from '@langchain/langgraph';

import { resetGraph } from '../src/graph';
import { setCheckpointer } from '../src/graph/checkpointer';
import { deriveConstraints } from '../src/graph/constraints';
import { validateGeneratedRecipe } from '../src/graph/validate';
import { clearModels, setModel } from '../src/llm/provider';
import { setFoodDatabase } from '../src/nutrition';
import { runChatTurn } from '../src/orchestrator';
import { expandAllergen } from '../src/retrieval/terms';
import { retrievalService } from '../src/retrieval';
import { FakeModel, routerReply } from './helpers/fake-model';
import { fixtureFoodDatabase } from './helpers/fixtures';

/**
 * Allergy safety, asserted against `expandAllergen` rather than through a
 * model.
 *
 * This is the point of the whole constraints/validator split. The compose
 * prompt states the exclusions, and a model will usually honour them — but
 * "usually" is not a property you can build an allergy feature on, and there is
 * no test you can write against a prompt that means anything. So the assertion
 * is made against the term tables directly, which is the same code path
 * retrieval filters on.
 *
 * None of this makes the app safe for a severe allergy: ingredient names are
 * free text, upstream data is inconsistent, and cross-contamination is not
 * modelled at all. The UI says so next to the severe-allergy callout. What
 * these tests establish is that the failure mode is the data, not the model.
 */

const withAllergy = (allergies: string[], diets: string[] = []) =>
  ({
    currentPantryItems: [],
    pantryNames: [],
    dietaryRestrictions: diets,
    healthGoals: [],
    allergies,
  }) as never;

describe('the blocked set', () => {
  it('expands an allergy to the words that appear in recipes', () => {
    const constraints = deriveConstraints(withAllergy(['dairy']), []);

    for (const term of ['butter', 'cheese', 'cream', 'parmesan', 'yoghurt']) {
      expect(constraints.blockedTokens.has(term)).toBe(true);
    }
  });

  it('drops a staple that collides with the allergy', () => {
    // Butter is a staple for most people and is not one for this user, and the
    // allowed set has to reflect that or the prompt offers it back.
    const constraints = deriveConstraints(withAllergy(['dairy']), ['chicken breast']);

    expect(constraints.allowed).not.toContain('butter');
    expect(constraints.allowed).toContain('olive oil');
  });

  it('never lets a named ingredient override an allergy', () => {
    // A user naming an ingredient overrides a *diet*, which is a preference.
    // An allergy is not a preference.
    const constraints = deriveConstraints(withAllergy(['peanut']), ['peanut butter', 'chicken breast']);

    expect(constraints.allowed).not.toContain('peanut butter');
    expect(constraints.allowed).toContain('chicken breast');
  });

  it('does let a named ingredient override a diet', () => {
    const constraints = deriveConstraints(withAllergy([], ['vegetarian']), ['chicken breast']);

    // Blocked as a term, because retrieval must still filter on it...
    expect(constraints.blockedTokens.has('chicken')).toBe(true);
    // ...but the user just said they have it and want it used.
    expect(constraints.allowed).not.toContain('chicken breast');
  });
});

describe('the validator against a declared allergy', () => {
  // The same free-text string the expansion under test is given, so the two
  // sets are identical by construction rather than by coincidence.
  const DECLARED = 'nut allergy';
  const constraints = deriveConstraints(withAllergy([DECLARED]), ['chicken breast', 'linguine']);

  const recipeWith = (name: string, step: string) => ({
    title: 'Test dish',
    servings: 2,
    prepTime: 5,
    cookTime: 10,
    difficulty: 'EASY',
    ingredients: [
      { name: 'chicken breast', amount: 2, unit: 'whole' },
      { name: 'linguine', amount: 200, unit: 'g' },
      { name, amount: 50, unit: 'g' },
    ],
    instructions: [
      { step: 1, instruction: 'Boil the linguine until just tender, then drain it well.' },
      { step: 2, instruction: 'Sear the chicken breast until golden and cooked through.' },
      { step: 3, instruction: step },
    ],
  });

  it.each(expandAllergen(DECLARED).filter(t => t.length > 3).slice(0, 12))(
    'rejects "%s" in the ingredient list',
    term => {
      const result = validateGeneratedRecipe(
        recipeWith(term, `Scatter the ${term} over and serve.`),
        constraints
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failures.some(f => f.safety)).toBe(true);
    }
  );

  it('rejects a blocked term that only appears in the method', () => {
    const recipe = recipeWith('olive oil', 'Finish with a spoon of almond butter and serve.');

    const result = validateGeneratedRecipe(recipe, constraints);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures.some(f => f.kind === 'blocked-ingredient' && f.safety)).toBe(true);
  });
});

describe('a generation request from a user with an allergy', () => {
  let searchSpy: jest.SpyInstance;

  beforeEach(() => {
    setCheckpointer(new MemorySaver());
    resetGraph();
    searchSpy = jest.spyOn(retrievalService, 'search').mockResolvedValue([]);
    setFoodDatabase(fixtureFoodDatabase);
  });

  afterEach(() => {
    clearModels();
    searchSpy.mockRestore();
    setFoodDatabase(null);
    setCheckpointer(null);
    resetGraph();
  });

  it('never emits a blocked term, even when the model keeps offering one', () => {
    // The model ignores the exclusion on both attempts, which is the case the
    // validator exists for. Two rejections means no recipe at all — and no
    // recipe is the correct answer here, stated as a compromise.
    const offending = JSON.stringify({
      title: 'Creamy chicken linguine',
      servings: 2,
      prepTime: 10,
      cookTime: 15,
      difficulty: 'EASY',
      ingredients: [
        { name: 'chicken breast', amount: 2, unit: 'whole' },
        { name: 'linguine', amount: 200, unit: 'g' },
        { name: 'double cream', amount: 150, unit: 'ml' },
      ],
      instructions: [
        { step: 1, instruction: 'Boil the linguine until just tender, then drain.' },
        { step: 2, instruction: 'Sear the chicken breast, then stir the double cream through.' },
      ],
    });

    setModel('router', new FakeModel('router', routerReply('compose', ['chicken breast', 'linguine'])));
    setModel('compose', new FakeModel('compose', offending));
    setModel('respond', new FakeModel('respond', "I could not put that one together, I'm afraid."));

    return runChatTurn({
      messages: [{ role: 'user', content: 'make me something with chicken and linguine' }],
      user: { id: 'u1', subscriptionTier: 'FREE' },
      context: withAllergy(['dairy']),
    }).then(response => {
      expect(response.generatedRecipe).toBeUndefined();
      expect(JSON.stringify(response)).not.toMatch(/double cream/i);
    });
  });

  it('tells the model about the exclusion in the prompt as well', () => {
    const compose = new FakeModel('compose', '{}');

    setModel('router', new FakeModel('router', routerReply('compose', ['chicken breast'])));
    setModel('compose', compose);
    setModel('respond', new FakeModel('respond', 'Not this time.'));

    return runChatTurn({
      messages: [{ role: 'user', content: 'a chicken recipe please' }],
      user: { id: 'u1', subscriptionTier: 'FREE' },
      context: withAllergy(['shellfish']),
    }).then(() => {
      expect(compose.promptText).toMatch(/EXCLUDED/);
      expect(compose.promptText).toMatch(/prawn/);
    });
  });
});
