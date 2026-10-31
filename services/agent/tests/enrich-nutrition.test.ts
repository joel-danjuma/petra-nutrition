import { setFoodDatabase } from '../src/nutrition';
import { enrichRecipe } from '../src/llm/enrich';
import type { AIChatService } from '../src/llm/groq';
import { fixtureFoodDatabase } from './helpers/fixtures';

/**
 * Enrichment and the nutrition node must not disagree about the same dish.
 *
 * The recipe screen's macro panel comes from enrichment; the chat reply's comes
 * from the graph. Before these were reconciled they were two different numbers
 * for one recipe, and nothing on either surface said which to believe.
 */

const recipe = {
  title: 'Chicken and Bell Pepper Linguine',
  cuisine: 'Italian',
  servings: 2,
  ingredients: [
    { name: 'chicken breast', amount: 2, unit: 'whole' },
    { name: 'linguine', amount: 200, unit: 'g' },
    { name: 'bell pepper', amount: 2, unit: 'whole' },
    { name: 'olive oil', amount: 2, unit: 'tbsp' },
  ],
  instructions: [
    { step: 1, instruction: 'Boil the linguine.' },
    { step: 2, instruction: 'Sear the chicken and peppers.' },
  ],
};

/** A model reply whose macros are plausible but wrong. */
const modelReply = (calories: number) =>
  JSON.stringify({
    prepTime: 10,
    cookTime: 20,
    difficulty: 'EASY',
    nutrition: { calories, protein: 30, carbs: 50, fat: 12 },
    safetyNote: 'Chicken breast should reach 74C at its thickest point before serving.',
    zeroWasteNote: 'Pepper cores and chicken trim make a quick stock for tomorrow.',
    stepTips: [],
  });

const fakeAi = (reply: string) =>
  ({ sendMessage: async () => ({ content: reply, type: 'text' }) }) as unknown as AIChatService;

describe('enrichment nutrition', () => {
  afterEach(() => setFoodDatabase(null));

  it('uses computed figures rather than the model estimate', async () => {
    setFoodDatabase(fixtureFoodDatabase);

    const result = await enrichRecipe(fakeAi(modelReply(410)), recipe);

    // The same figure the nutrition node's hand-calculation test asserts.
    expect(result.nutrition.calories).toBe(748);
    expect(result.nutrition.protein).toBeCloseTo(53.7, 1);
    // Everything else the model produced is untouched.
    expect(result.prepTime).toBe(10);
    expect(result.safetyNote).toMatch(/74C/);
  });

  it('keeps the model estimate when the ingredients cannot be resolved', async () => {
    // A confident-looking zero is much worse than a rough estimate.
    setFoodDatabase({ lookup: async () => null });

    const result = await enrichRecipe(fakeAi(modelReply(410)), recipe);

    expect(result.nutrition.calories).toBe(410);
  });

  it('still enriches when the nutrition lookup throws', async () => {
    setFoodDatabase({
      lookup: async () => {
        throw new Error('FoodData Central is unreachable');
      },
    });

    const result = await enrichRecipe(fakeAi(modelReply(410)), recipe);

    expect(result.nutrition.calories).toBe(410);
    expect(result.difficulty).toBe('EASY');
  });
});
