import { RedisSaver, setCheckpointer } from '../src/graph/checkpointer';
import { resetGraph } from '../src/graph';
import { clearModels, setModel } from '../src/llm/provider';
import { analyse, setFoodDatabase, usdaFoodDatabase } from '../src/nutrition';
import { runChatTurn } from '../src/orchestrator';
import { retrievalService } from '../src/retrieval';
import { FakeModel, routerReply } from './helpers/fake-model';
import { LINGUINE_RECIPE } from './helpers/fixtures';

/**
 * What happens when the things the graph leans on are not there.
 *
 * `retrieval/index.ts` already sets the posture: semantic retrieval that cannot
 * load its model degrades to lexical and pantry signals rather than failing the
 * chat. The graph has to match it, because the alternative is a kitchen
 * assistant that stops answering when a cache restarts.
 *
 * Everything here asserts the same thing from a different angle: the user still
 * gets a reply.
 */

describe('with Redis unreachable', () => {
  let searchSpy: jest.SpyInstance;

  beforeEach(() => {
    // A real RedisSaver pointed at nothing. `getRedis` returns null when
    // `REDIS_URL` is unset (which `tests/setup.ts` guarantees), so every
    // checkpoint operation is a no-op — the same behaviour a dead Redis
    // produces, reached without standing one up to kill.
    setCheckpointer(new RedisSaver(60));
    resetGraph();
    searchSpy = jest.spyOn(retrievalService, 'search').mockResolvedValue([]);
    setModel('router', new FakeModel('router', routerReply('compose', ['chicken breast', 'linguine', 'bell pepper'])));
    setModel('compose', new FakeModel('compose', LINGUINE_RECIPE));
    setModel('nutrition', new FakeModel('nutrition', JSON.stringify({ grams: [] })));
    setModel('respond', new FakeModel('respond', 'Here is a dish built around what you have.'));
  });

  afterEach(() => {
    clearModels();
    searchSpy.mockRestore();
    setCheckpointer(null);
    resetGraph();
  });

  it('still answers, and still composes', async () => {
    const response = await runChatTurn({
      messages: [{ role: 'user', content: 'a recipe with chicken breast, linguine and bell peppers' }],
      user: { id: 'u1', subscriptionTier: 'FREE' },
    });

    expect(response.content.length).toBeGreaterThan(10);
    expect(response.generatedRecipe).toBeDefined();
  });
});

describe('with FDC_API_KEY unset', () => {
  it('reports every ingredient as unresolved rather than inventing numbers', async () => {
    // No key and no network reachable from a test: the real database returns
    // nothing, and nothing is what it says. A model estimate here would be
    // indistinguishable from a measurement, which is the failure mode the
    // whole provenance field exists to prevent.
    const emptyDatabase = { lookup: async () => null };

    const result = await analyse(
      {
        servings: 2,
        ingredients: [
          { name: 'chicken breast', amount: 2, unit: 'whole' },
          { name: 'linguine', amount: 200, unit: 'g' },
        ],
      },
      { foods: emptyDatabase, allowModelWeights: false }
    );

    expect(result.confidence).toBe('low');
    expect(result.items.every(i => i.source === 'unresolved')).toBe(true);
    expect(result.perServing.calories).toBe(0);
    // The grams were still resolved, so the gap is the lookup and the
    // provenance says which ingredient it was.
    expect(result.items[0].grams).toBe(348);
  });

  it('is the module default, so an unconfigured deploy still boots', () => {
    setFoodDatabase(null);
    expect(usdaFoodDatabase).toBeDefined();
  });
});

describe('with retrieval failing outright', () => {
  let searchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetGraph();
    searchSpy = jest
      .spyOn(retrievalService, 'search')
      .mockRejectedValue(new Error('relation "recipes" does not exist'));
    setModel('router', new FakeModel('router', routerReply('search', [])));
    setModel(
      'respond',
      new FakeModel('respond', 'I could not reach your recipe library, but here is the idea.')
    );
  });

  afterEach(() => {
    clearModels();
    searchSpy.mockRestore();
    setCheckpointer(null);
    resetGraph();
  });

  it('answers ungrounded rather than erroring', async () => {
    const response = await runChatTurn({
      messages: [{ role: 'user', content: 'what can I cook tonight?' }],
      user: { id: 'u1', subscriptionTier: 'FREE' },
    });

    expect(response.content.length).toBeGreaterThan(10);
    expect(response.recipeId).toBeUndefined();
  });
});

describe('with the router model failing', () => {
  let searchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetGraph();
    searchSpy = jest.spyOn(retrievalService, 'search').mockResolvedValue([]);
  });

  afterEach(() => {
    clearModels();
    searchSpy.mockRestore();
    setCheckpointer(null);
    resetGraph();
  });

  it('still reaches compose, via the phrase heuristic', async () => {
    // Defaulting a failed router parse to plain chat is right in general, and
    // catastrophic for exactly this sentence — it is the bug being fixed. So
    // the heuristic recovers both the intent and the named ingredients.
    const compose = new FakeModel('compose', LINGUINE_RECIPE);

    setModel('router', new FakeModel('router', 'the model returned prose instead of JSON'));
    setModel('compose', compose);
    setModel('nutrition', new FakeModel('nutrition', JSON.stringify({ grams: [] })));
    setModel('respond', new FakeModel('respond', 'Here is one built around what you have.'));

    const response = await runChatTurn({
      messages: [
        {
          role: 'user',
          content:
            "I've got chicken breasts, linguine, and bell peppers, create a recipe for me with those ingredients",
        },
      ],
      user: { id: 'u1', subscriptionTier: 'FREE' },
    });

    expect(response.generatedRecipe).toBeDefined();
    expect(compose.promptText).toMatch(/chicken breasts/);
    expect(compose.promptText).toMatch(/linguine/);
    expect(compose.promptText).toMatch(/bell peppers/);
  });
});
