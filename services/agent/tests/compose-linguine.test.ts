import { MemorySaver } from '@langchain/langgraph';

import { resetGraph } from '../src/graph';
import { setCheckpointer } from '../src/graph/checkpointer';
import { clearModels, setModel } from '../src/llm/provider';
import { runChatTurn, runChatTurnStreaming } from '../src/orchestrator';
import { setFoodDatabase } from '../src/nutrition';
import { retrievalService } from '../src/retrieval';
import { FakeModel, routerReply } from './helpers/fake-model';
import { LINGUINE_RECIPE, fixtureFoodDatabase } from './helpers/fixtures';

/**
 * The failing case.
 *
 * "I've got chicken breasts, linguine, and bell peppers, create a recipe for me
 * with those ingredients" returned nothing usable, because there was no
 * generative path with teeth: the turn retrieved, grounded and replied, and
 * when retrieval missed there was no fallback that constructed a dish under
 * constraints.
 *
 * This is the acceptance criterion for the whole graph, so it asserts the
 * things a cook would check — ordered steps, real quantities, macros, and
 * nothing in the list that would send them to a shop.
 *
 * It runs offline. The models are scripted through `setModel`, the same seam an
 * eval harness uses, and retrieval and the nutrition database are stubbed. A
 * test that needs a GROQ_API_KEY runs once and then rots; this one runs on
 * every commit. `tests/live-compose.test.ts` covers the real models, gated on
 * the key being present.
 */

const QUESTION =
  "I've got chicken breasts, linguine, and bell peppers, create a recipe for me with those ingredients";

const request = (content = QUESTION) => ({
  messages: [{ role: 'user' as const, content }],
  user: { id: 'user-1', subscriptionTier: 'FREE' as const },
  context: {
    currentPantryItems: [],
    pantryNames: [],
    dietaryRestrictions: [],
    healthGoals: [],
    allergies: [],
  },
});

describe('composing a recipe from named ingredients', () => {
  let searchSpy: jest.SpyInstance;

  beforeEach(() => {
    setCheckpointer(new MemorySaver());
    resetGraph();

    // Retrieval finds nothing that fits, which is the situation that used to
    // end the turn and now starts the compose path.
    searchSpy = jest.spyOn(retrievalService, 'search').mockResolvedValue([]);
    // Fixed USDA rows, so the macros are checkable and no test makes a network
    // call to a free, rate-limited service.
    setFoodDatabase(fixtureFoodDatabase);

    setModel('router', new FakeModel('router', routerReply('compose', [
      'chicken breasts',
      'linguine',
      'bell peppers',
    ])));
    setModel('compose', new FakeModel('compose', LINGUINE_RECIPE));
    setModel('nutrition', new FakeModel('nutrition', JSON.stringify({ grams: [] })));
    setModel(
      'respond',
      new FakeModel(
        'respond',
        'Seared chicken and sweet peppers through linguine, finished with a splash ' +
          'of the starchy pasta water so the sauce clings. It comes together in the ' +
          'time the pasta takes. The one thing that matters is getting real colour on ' +
          'the chicken before the peppers go in.'
      )
    );
  });

  afterEach(() => {
    clearModels();
    searchSpy.mockRestore();
    setFoodDatabase(null);
    setCheckpointer(null);
    resetGraph();
  });

  it('returns a cookable recipe rather than prose or nothing', async () => {
    const response = await runChatTurn(request());

    expect(response.type).toBe('generated_recipe');
    expect(response.generatedRecipe).toBeDefined();
    expect(response.content.length).toBeGreaterThan(40);
  });

  it('gives ordered steps a cook could follow', async () => {
    const { generatedRecipe } = await runChatTurn(request());
    const steps = generatedRecipe!.instructions;

    expect(steps.length).toBeGreaterThanOrEqual(3);
    // Contiguous from 1, because a method that skips step 3 is not a method.
    expect(steps.map(s => s.step)).toEqual(steps.map((_, i) => i + 1));
    for (const step of steps) {
      expect(step.instruction.length).toBeGreaterThan(20);
    }
  });

  it('gives every ingredient a quantity', async () => {
    const { generatedRecipe } = await runChatTurn(request());

    for (const ingredient of generatedRecipe!.ingredients) {
      expect(ingredient.amount).toBeGreaterThan(0);
      expect(Number.isFinite(ingredient.amount)).toBe(true);
    }
  });

  it('uses only the three named ingredients and pantry staples', async () => {
    const { generatedRecipe } = await runChatTurn(request());

    const nonStaple = generatedRecipe!.ingredients.filter(i => !i.staple).map(i => i.name.toLowerCase());

    // Nothing here should require a trip to a shop.
    for (const name of nonStaple) {
      expect(name).toMatch(/chicken|linguine|pepper/);
    }
    // And all three of the things they said they had are actually used.
    for (const named of ['chicken', 'linguine', 'pepper']) {
      expect(nonStaple.join(' ')).toContain(named);
    }
  });

  it('carries macros for the portion it suggested', async () => {
    const response = await runChatTurn(request());
    const nutrition = response.nutrition!;

    expect(nutrition).toBeDefined();
    expect(nutrition.perServing.calories).toBeGreaterThan(200);
    expect(nutrition.perServing.protein).toBeGreaterThan(10);
    expect(nutrition.servings).toBe(response.generatedRecipe!.servings);
    // Every number traceable to a source row.
    expect(nutrition.items.length).toBe(response.generatedRecipe!.ingredients.length);
  });

  it('states the serving count it assumed', async () => {
    const response = await runChatTurn(request());

    expect(response.assumptions.join(' ')).toMatch(/serving/i);
  });

  it('streams node progress before any prose', async () => {
    const events: string[] = [];

    await runChatTurnStreaming(
      request(),
      () => events.push('chunk'),
      undefined,
      { onNode: node => events.push(`node:${node}`) }
    );

    const firstChunk = events.indexOf('chunk');
    expect(firstChunk).toBeGreaterThan(0);
    expect(events.slice(0, firstChunk)).toEqual([
      'node:router',
      'node:search',
      'node:compose_recipe',
      'node:nutrition',
    ]);
  });
});
