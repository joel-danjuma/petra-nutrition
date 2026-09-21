import { extractRecipeRef } from '../src/llm/chat-prompt';
import type { RetrievedRecipeContext } from '../src/llm/types';

/**
 * Which recipe the reply is about.
 *
 * A reply that names a real recipe but produces no id is the shape of the
 * reported bug: prose about a dish with nothing to tap. The marker is exact and
 * the model drops it; an exact title match dies on the first paraphrase. Hence
 * the third strategy, and hence the margin guard on it — a card for the wrong
 * recipe is worse than no card at all.
 */

const candidate = (id: string, title: string): RetrievedRecipeContext => ({
  id,
  title,
  cuisine: null,
  totalTime: 30,
  matched: [],
  missing: [],
});

describe('extractRecipeRef', () => {
  it('takes the marker, and strips it from what the user reads', () => {
    const { content, recipeId, match } = extractRecipeRef(
      'Go with the traybake tonight.\n[recipe:abc-123]',
      [candidate('abc-123', 'Harissa Chicken Traybake')]
    );

    expect(recipeId).toBe('abc-123');
    expect(match).toBe('marker');
    expect(content).not.toContain('recipe:');
  });

  it('ignores an id that was never on the shortlist', () => {
    // A hallucinated id would 404 on the recipe screen.
    const { recipeId } = extractRecipeRef('Try this one. [recipe:not-a-real-id]', [
      candidate('abc-123', 'Harissa Chicken Traybake'),
    ]);

    expect(recipeId).toBeUndefined();
  });

  it('falls back to an exact title in the prose', () => {
    const { recipeId, match } = extractRecipeRef(
      'Harissa Chicken Traybake is the one — everything goes in a single tin.',
      [candidate('abc-123', 'Harissa Chicken Traybake')]
    );

    expect(recipeId).toBe('abc-123');
    expect(match).toBe('title');
  });

  it('resolves a paraphrased title', () => {
    // The real failure: the model wrote the dish in its own words, and the
    // reply carried no card even though it named a library recipe.
    const { recipeId, match } = extractRecipeRef(
      'The garlic and tomato spaghetti with bell peppers is quick and uses what you have.',
      [candidate('abc-123', 'Spaghetti with Garlic-Tomato Bell Pepper Sauce')]
    );

    expect(recipeId).toBe('abc-123');
    expect(match).toBe('fuzzy');
  });

  it('refuses to guess between two candidates a paraphrase fits equally', () => {
    // Neither title appears verbatim, and both are built from the same words,
    // so the only honest answer is no card rather than a coin flip.
    const { recipeId, match } = extractRecipeRef(
      'A warming soup with tomato and basil would do it.',
      [candidate('a', 'Tomato and Basil Soup'), candidate('b', 'Basil Tomato Soup')]
    );

    expect(recipeId).toBeUndefined();
    expect(match).toBe('none');
  });

  it('still prefers an exact title over a fuzzier rival', () => {
    const { recipeId, match } = extractRecipeRef('The Chicken Curry is a good shout tonight.', [
      candidate('a', 'Chicken Curry'),
      candidate('b', 'Chicken Curry with Rice'),
    ]);

    expect(recipeId).toBe('a');
    expect(match).toBe('title');
  });

  it('reports no match when the reply names nothing on the shortlist', () => {
    const { recipeId, match } = extractRecipeRef(
      'Basil keeps best on the counter in a glass of water.',
      [candidate('abc-123', 'Harissa Chicken Traybake')]
    );

    expect(recipeId).toBeUndefined();
    expect(match).toBe('none');
  });
});
