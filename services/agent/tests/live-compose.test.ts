import { MemorySaver } from '@langchain/langgraph';

import { resetGraph } from '../src/graph';
import { setCheckpointer } from '../src/graph/checkpointer';
import { setFoodDatabase } from '../src/nutrition';
import { runChatTurn } from '../src/orchestrator';
import { retrievalService } from '../src/retrieval';
import { fixtureFoodDatabase } from './helpers/fixtures';

/**
 * The failing case against the real models.
 *
 * Skipped unless a usable `GROQ_API_KEY` is in the environment, which keeps CI
 * offline and deterministic. `tests/compose-linguine.test.ts` is the test that
 * runs on every commit; this one is for the question that scripted models
 * cannot answer — whether the prompt is actually good enough that a real model
 * produces a cookable dish inside the allowed set.
 *
 *   GROQ_API_KEY=... pnpm --filter @petra/agent exec jest tests/live-compose
 *
 * Retrieval and the nutrition database are still stubbed, so the only variable
 * is the model. The assertions are the same ones a cook would make, and they
 * are deliberately loose about *which* dish: this checks the constraints hold,
 * not that a particular recipe comes back.
 */

const hasKey = !!process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'test-key';
const describeLive = hasKey ? describe : describe.skip;

describeLive('composing against the real models', () => {
  let searchSpy: jest.SpyInstance;

  beforeAll(() => {
    setCheckpointer(new MemorySaver());
    resetGraph();
    searchSpy = jest.spyOn(retrievalService, 'search').mockResolvedValue([]);
    setFoodDatabase(fixtureFoodDatabase);
  });

  afterAll(() => {
    searchSpy.mockRestore();
    setFoodDatabase(null);
    setCheckpointer(null);
    resetGraph();
  });

  // Generous: two model calls plus a possible retry, on a free tier.
  jest.setTimeout(120_000);

  it('answers the linguine question with a cookable recipe', async () => {
    const response = await runChatTurn({
      messages: [
        {
          role: 'user',
          content:
            "I've got chicken breasts, linguine, and bell peppers, create a recipe for me with those ingredients",
        },
      ],
      user: { id: 'live-test', subscriptionTier: 'FREE' },
      context: {
        currentPantryItems: [],
        pantryNames: [],
        dietaryRestrictions: [],
        healthGoals: [],
        allergies: [],
      },
    });

    // Log it: when this fails, the useful artefact is the dish, not the assertion.
    console.log(JSON.stringify({ content: response.content, recipe: response.generatedRecipe }, null, 2));

    expect(response.type).toBe('generated_recipe');

    const recipe = response.generatedRecipe!;
    expect(recipe.instructions.length).toBeGreaterThanOrEqual(3);
    expect(recipe.ingredients.every(i => i.amount > 0)).toBe(true);

    const nonStaple = recipe.ingredients.filter(i => !i.staple).map(i => i.name.toLowerCase());
    for (const name of nonStaple) {
      expect(name).toMatch(/chicken|linguine|pepper/);
    }

    expect(response.nutrition?.perServing.calories).toBeGreaterThan(100);
  });
});
