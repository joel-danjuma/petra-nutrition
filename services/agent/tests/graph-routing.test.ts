import { MemorySaver } from '@langchain/langgraph';

import { afterCompose, afterRouter, afterSearch, resetGraph } from '../src/graph';
import { setCheckpointer } from '../src/graph/checkpointer';
import { GraphState, type GraphStateType } from '../src/graph/state';
import { clearModels, setModel } from '../src/llm/provider';
import { setFoodDatabase } from '../src/nutrition';
import { runChatTurn, runChatTurnStreaming } from '../src/orchestrator';
import { retrievalService, type RetrievedRecipe } from '../src/retrieval';
import { FakeModel, routerReply } from './helpers/fake-model';
import { LINGUINE_RECIPE, fixtureFoodDatabase } from './helpers/fixtures';

/**
 * The edges, first as pure functions and then through the graph.
 *
 * Testing the edge functions directly is worth doing on its own: they encode
 * the decisions this design is actually about — when a library recipe is good
 * enough, when to compose instead, how many times to retry — and each one is a
 * single expression that a table test covers completely.
 */

const state = (overrides: Partial<GraphStateType> = {}): GraphStateType =>
  ({
    messages: [],
    context: undefined,
    options: undefined,
    userMessage: '',
    intent: 'chat',
    namedIngredients: [],
    servings: null,
    clarification: null,
    retrieved: [],
    retrievalSufficient: false,
    overflow: [],
    draft: null,
    failures: [],
    composeAttempts: 0,
    macros: null,
    assumptions: [],
    compromises: [],
    response: null,
    model: undefined,
    tokensUsed: 0,
    ...overrides,
  }) as GraphStateType;

describe('afterRouter', () => {
  it('sends a clarifying question straight out', () => {
    expect(
      afterRouter(state({ intent: 'compose', clarification: { question: 'Hot or cold?', options: [] } }))
    ).toBe('clarify');
  });

  it('skips retrieval entirely for plain conversation', () => {
    // A storage question does not need a shortlist the reply then ignores.
    expect(afterRouter(state({ intent: 'chat' }))).toBe('respond');
  });

  it.each(['search', 'compose', 'nutrition'] as const)('routes %s through retrieval', intent => {
    expect(afterRouter(state({ intent }))).toBe('search');
  });
});

describe('afterSearch', () => {
  it('recommends a library recipe when one genuinely fits', () => {
    // A real recipe can be opened, cooked hands-free and added to a plan. A
    // composed one cannot, so a fitting hit wins.
    expect(afterSearch(state({ intent: 'search', retrievalSufficient: true }))).toBe('respond');
  });

  it('composes when the shortlist does not fit — the failing case', () => {
    expect(afterSearch(state({ intent: 'search', retrievalSufficient: false }))).toBe(
      'compose_recipe'
    );
  });

  it('always composes when the user named the ingredients', () => {
    // "Create a recipe with X, Y, Z" is not a question about the corpus, so
    // even a good-looking shortlist does not answer it.
    expect(afterSearch(state({ intent: 'compose', retrievalSufficient: true }))).toBe(
      'compose_recipe'
    );
  });

  it('goes straight to macros for a nutrition question', () => {
    expect(afterSearch(state({ intent: 'nutrition', retrievalSufficient: true }))).toBe('nutrition');
  });
});

describe('afterCompose', () => {
  it('proceeds to macros once a draft passes validation', () => {
    expect(afterCompose(state({ draft: {} as never, composeAttempts: 1 }))).toBe('nutrition');
  });

  it('retries exactly once', () => {
    expect(afterCompose(state({ draft: null, composeAttempts: 1 }))).toBe('compose_recipe');
    expect(afterCompose(state({ draft: null, composeAttempts: 2 }))).toBe('respond');
  });
});

describe('the graph end to end', () => {
  let searchSpy: jest.SpyInstance;

  const hit = (over: Partial<RetrievedRecipe> = {}): RetrievedRecipe => ({
    id: 'recipe-1',
    title: 'Harissa Chicken Traybake',
    imageUrl: null,
    cuisine: 'North African',
    totalTime: 45,
    servings: 4,
    dietaryTags: [],
    matched: ['chicken breast'],
    missing: ['harissa'],
    coverage: 0.5,
    score: 0.02,
    reasons: ['lexical'],
    ...over,
  });

  beforeEach(() => {
    setCheckpointer(new MemorySaver());
    resetGraph();
    searchSpy = jest.spyOn(retrievalService, 'search');
    setFoodDatabase(fixtureFoodDatabase);
    setModel('nutrition', new FakeModel('nutrition', JSON.stringify({ grams: [] })));
  });

  afterEach(() => {
    clearModels();
    searchSpy.mockRestore();
    setFoodDatabase(null);
    setCheckpointer(null);
    resetGraph();
  });

  const ask = (content: string, context: Record<string, unknown> = {}) =>
    runChatTurn({
      messages: [{ role: 'user', content }],
      user: { id: 'u1', subscriptionTier: 'FREE' },
      context: {
        currentPantryItems: [],
        pantryNames: [],
        dietaryRestrictions: [],
        healthGoals: [],
        allergies: [],
        ...context,
      } as never,
    });

  it('recommends from the library when a recipe covers what was asked for', async () => {
    searchSpy.mockResolvedValue([hit({ matched: ['chicken breast', 'harissa'], missing: [] })]);

    setModel('router', new FakeModel('router', routerReply('search', ['chicken breast', 'harissa'])));
    setModel(
      'respond',
      new FakeModel(
        'respond',
        'Harissa Chicken Traybake is the one — everything goes in one tin. [recipe:recipe-1]'
      )
    );

    const response = await ask('what can I make with chicken breast and harissa?');

    expect(response.recipeId).toBe('recipe-1');
    expect(response.generatedRecipe).toBeUndefined();
    expect(response.type).toBe('recipe_suggestion');
  });

  it('falls through to composing when nothing in the library fits', async () => {
    // A hit exists but it misses one of the named ingredients, which is the
    // case that used to be answered with "here is the nearest thing I have".
    searchSpy.mockResolvedValue([hit({ matched: ['chicken breast'], missing: ['harissa'] })]);

    setModel(
      'router',
      new FakeModel('router', routerReply('search', ['chicken breast', 'linguine', 'bell pepper']))
    );
    setModel('compose', new FakeModel('compose', LINGUINE_RECIPE));
    setModel('respond', new FakeModel('respond', 'Here is one built around what you have.'));

    const response = await ask('anything I can do with chicken breast, linguine and bell peppers?');

    expect(response.type).toBe('generated_recipe');
    expect(response.generatedRecipe?.title).toMatch(/Linguine/);
  });

  it('seeds the merge path with what retrieval found', async () => {
    searchSpy.mockResolvedValue([hit()]);
    const compose = new FakeModel('compose', LINGUINE_RECIPE);

    setModel('router', new FakeModel('router', routerReply('compose', ['chicken breast', 'linguine', 'bell pepper'])));
    setModel('compose', compose);
    setModel('respond', new FakeModel('respond', 'Built on the traybake idea, with what you have.'));

    const response = await ask('make me something with chicken breast, linguine and bell peppers');

    // The library recipe reached the prompt as a seed...
    expect(compose.promptText).toContain('Harissa Chicken Traybake');
    // ...and is recorded, for the quiet "inspired by" line.
    expect(response.generatedRecipe?.inspiredBy).toContain('recipe-1');
    expect(response.assumptions.join(' ')).toMatch(/Inspired by/);
  });

  it('retries once with the violations fed back, then succeeds', async () => {
    searchSpy.mockResolvedValue([]);

    const rejected = JSON.stringify({
      ...JSON.parse(LINGUINE_RECIPE),
      ingredients: [
        ...JSON.parse(LINGUINE_RECIPE).ingredients,
        { name: 'double cream', amount: 150, unit: 'ml' },
      ],
    });
    const compose = new FakeModel('compose', [rejected, LINGUINE_RECIPE]);

    setModel('router', new FakeModel('router', routerReply('compose', ['chicken breast', 'linguine', 'bell pepper'])));
    setModel('compose', compose);
    setModel('respond', new FakeModel('respond', 'Here it is, without the cream.'));

    const response = await ask('a recipe with chicken breast, linguine and bell peppers');

    expect(compose.calls).toHaveLength(2);
    // The retry was told what was actually wrong, not just asked again.
    expect(compose.calls[1].map(m => m.content).join('\n')).toMatch(/REJECTED/);
    expect(compose.calls[1].map(m => m.content).join('\n')).toMatch(/double cream/i);
    expect(response.generatedRecipe).toBeDefined();
  });

  it('degrades with the compromise stated when both attempts fail', async () => {
    searchSpy.mockResolvedValue([]);

    setModel('router', new FakeModel('router', routerReply('compose', ['chicken breast'])));
    setModel('compose', new FakeModel('compose', 'not json at all'));
    setModel(
      'respond',
      new FakeModel('respond', "I could not put a recipe together from that, I'm afraid.")
    );

    const response = await ask('a recipe with chicken breast');

    expect(response.generatedRecipe).toBeUndefined();
    expect(response.content.length).toBeGreaterThan(10);
    expect(response.type).not.toBe('generated_recipe');
  });

  it('ends the turn with a question when the answer forks the dish', async () => {
    const interrupts: { question: string; options: string[] }[] = [];

    setModel(
      'router',
      new FakeModel(
        'router',
        routerReply('compose', ['chicken breast'], null, {
          question: 'Do you want this hot for tonight, or cold for lunch tomorrow?',
          options: ['Hot tonight', 'Cold tomorrow'],
        })
      )
    );

    const response = await runChatTurnStreaming(
      {
        messages: [{ role: 'user', content: 'do something with these chicken breasts' }],
        user: { id: 'u1', subscriptionTier: 'FREE' },
      },
      () => undefined,
      undefined,
      { onInterrupt: (question, options) => interrupts.push({ question, options }) }
    );

    expect(interrupts).toHaveLength(1);
    expect(response.content).toMatch(/hot for tonight/i);
    expect(response.suggestions).toEqual(['Hot tonight', 'Cold tomorrow']);
    // Retrieval never ran: the question comes before the work.
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('searches the caller\'s own saved recipes as well as the public corpus', async () => {
    // A saved generation is written private, so without the owner id it is
    // embedded and then permanently unfindable — the write nobody can read.
    searchSpy.mockResolvedValue([]);

    setModel('router', new FakeModel('router', routerReply('search', [])));
    setModel('respond', new FakeModel('respond', 'Here is what I found.'));

    await ask('what can I cook tonight?');

    expect(searchSpy).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'u1' }));
  });

  it('answers a plain question without touching retrieval', async () => {
    setModel('router', new FakeModel('router', routerReply('chat', [])));
    setModel(
      'respond',
      new FakeModel('respond', 'Cooked rice keeps about three days in the fridge, well covered.')
    );

    const response = await ask('how long does cooked rice keep in the fridge?');

    expect(searchSpy).not.toHaveBeenCalled();
    expect(response.type).toBe('text');
  });
});
