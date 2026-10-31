import { MemorySaver } from '@langchain/langgraph';

import { resetGraph } from '../src/graph';
import { setCheckpointer } from '../src/graph/checkpointer';
import {
  heuristicIntent,
  isRefinement,
  parseMaxMinutes,
} from '../src/graph/nodes/router';
import { clearModels, setModel } from '../src/llm/provider';
import { setFoodDatabase } from '../src/nutrition';
import { runChatTurn } from '../src/orchestrator';
import { retrievalService, type RetrievedRecipe } from '../src/retrieval';
import { FakeModel, routerReply } from './helpers/fake-model';
import { LINGUINE_RECIPE, fixtureFoodDatabase } from './helpers/fixtures';

/**
 * Refinements, and the state that has to be cleared between turns.
 *
 * The reported failure was a three-word follow-up: "Under 30 minutes" after a
 * question about dinner. Read on its own it is not a request for food at all,
 * so it classified as conversation, retrieval was skipped, and the model
 * answered with a dish it invented and nothing the user could tap.
 */

describe('isRefinement', () => {
  it.each([
    'Under 30 minutes',
    'something lighter',
    'no fish',
    'vegetarian instead',
    'one pot',
    'cheaper',
  ])('treats %j as a continuation', message => {
    expect(isRefinement(message)).toBe(true);
  });

  it.each([
    // Questions about technique are their own subject, however short.
    'how long does basil keep?',
    'can I freeze it?',
    'what should I store it in',
    // Not constraint-shaped at all.
    'thanks, that was great',
    'no, the other one',
    // Long enough to stand on its own terms and be classified normally.
    'I have chicken thighs and rice and I would like something warming for tonight',
  ])('does not treat %j as a continuation', message => {
    expect(isRefinement(message)).toBe(false);
  });
});

describe('heuristicIntent', () => {
  it('carries a food-finding intent across a refinement', () => {
    expect(heuristicIntent('Under 30 minutes', 'search')).toBe('search');
    expect(heuristicIntent('something lighter', 'compose')).toBe('compose');
  });

  it('does not carry from a conversational turn', () => {
    // Nothing to continue: the previous turn was not about finding food.
    expect(heuristicIntent('Under 30 minutes', 'chat')).toBe('chat');
  });

  it('still classifies on its own terms without a previous intent', () => {
    expect(heuristicIntent('what can I make tonight?')).toBe('search');
    expect(heuristicIntent('how do I store basil?')).toBe('chat');
  });
});

describe('parseMaxMinutes', () => {
  it.each([
    ['under 30 minutes', 30],
    ['something in 20 mins', 20],
    ['half an hour', 30],
    ['an hour', 60],
    ['no more than 2 hours', 120],
  ])('reads %j as %i minutes', (message, expected) => {
    expect(parseMaxMinutes(message)).toBe(expected);
  });

  it.each(['something warming', 'I have 500 g of chicken', 'serves 4'])(
    'reads no limit from %j',
    message => {
      expect(parseMaxMinutes(message)).toBeNull();
    }
  );
});

describe('a refinement, through the graph', () => {
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
    missing: [],
    coverage: 1,
    score: 0.02,
    reasons: ['semantic'],
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

  const ask = (content: string) =>
    runChatTurn({
      messages: [{ role: 'user', content }],
      user: { id: 'u1', subscriptionTier: 'FREE' },
      options: { threadId: 'session-1' },
      context: {
        currentPantryItems: [],
        pantryNames: [],
        dietaryRestrictions: [],
        healthGoals: [],
        allergies: [],
      } as never,
    } as never);

  it('retrieves for a follow-up the router calls conversation', async () => {
    searchSpy.mockResolvedValue([hit({ totalTime: 25 })]);

    // The router answers "search" first and "chat" second, which is exactly
    // what it did in production for the terse follow-up.
    setModel('router', new FakeModel('router', [routerReply('search', []), routerReply('chat', [])]));
    setModel(
      'respond',
      new FakeModel('respond', 'Harissa Chicken Traybake fits. [recipe:recipe-1]')
    );

    await ask('what should I make for dinner?');
    expect(searchSpy).toHaveBeenCalledTimes(1);

    const second = await ask('Under 30 minutes');

    // The whole point: the second turn is grounded rather than invented.
    expect(searchSpy).toHaveBeenCalledTimes(2);
    expect(second.recipeId).toBe('recipe-1');
  });

  it('does not carry a draft from an earlier turn into a later one', async () => {
    // State is checkpointed per session, so without a per-turn reset the
    // second reply arrives carrying the first turn's composed recipe and the
    // client renders a card for a question that never asked for one.
    searchSpy.mockResolvedValue([]);

    setModel(
      'router',
      new FakeModel('router', [routerReply('compose', ['chicken breast', 'linguine', 'bell pepper']), routerReply('chat', [])])
    );
    setModel('compose', new FakeModel('compose', LINGUINE_RECIPE));
    setModel('respond', new FakeModel('respond', 'Here you go.'));

    const first = await ask('make me a recipe with chicken breast, linguine and bell peppers');
    expect(first.generatedRecipe?.title).toBe('Chicken and Bell Pepper Linguine');

    const second = await ask('how do I store basil?');
    expect(second.generatedRecipe).toBeUndefined();
  });
});
