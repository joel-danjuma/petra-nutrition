import { normalise } from '../retrieval/terms';
import { stripMarkdown } from './strip-markdown';
import type { ChatContext, ChatMessage, ChatResponse, RetrievedRecipeContext } from './types';

/**
 * Building the chat prompt, and reading the reply back.
 *
 * Extracted from `AIChatService` when the graph arrived, because two callers
 * now need it: the graph's `respond` node, and the `/v1/cooking-tips`,
 * `/v1/nutrition/analyze` and `/v1/meal-plans/generate` endpoints, which are
 * single-shot model calls and gain nothing from a graph. These are pure
 * functions of their inputs — no provider, no client, no keys — which is what
 * lets both use them without either depending on the other.
 *
 * `extractRecipeRef` in particular is the thing that must not be duplicated: it
 * decides which library recipe a reply is recommending, and two
 * implementations means the streamed answer and the persisted one can disagree
 * about which recipe card to show.
 */

/**
 * The house voice, and the grounding rules.
 *
 * The no-markdown block is not stylistic fussiness: the app has no markdown
 * renderer, so a stray `**dish**` reaches the chat bubble as literal asterisks.
 * `stripMarkdown` is the belt to these braces.
 */
export interface PromptOptions {
  /**
   * How much room the reply gets.
   *
   * `terse` is for a chat turn, which is read on a phone beside a recipe card
   * that already carries the timings, ingredients and macros. `standard` is for
   * the single-shot endpoints — a seven-day meal plan cannot be written in
   * three sentences — so it stays the default and those callers are untouched.
   */
  brevity?: 'terse' | 'standard';
}

export function buildSystemPrompt(
  context?: ChatContext,
  { brevity = 'standard' }: PromptOptions = {}
): string {
  const terse = brevity === 'terse';

  let systemPrompt = `You are Petra, an intelligent AI kitchen assistant. You help users with:

1. Recipe discovery and generation based on ingredients, preferences, and dietary restrictions
2. Meal planning for individuals and families
3. Pantry management and inventory tracking
4. Smart shopping list creation
5. Nutritional guidance and cooking tips
6. Food storage and safety advice

Guidelines:
- Be friendly, helpful, and encouraging
- Always consider dietary restrictions and allergies
- Provide practical, actionable advice${
    terse
      ? ''
      : '\n- When suggesting recipes, include prep time, cook time, and difficulty level'
  }
- For meal planning, consider nutritional balance and variety
- Be mindful of food waste and suggest ways to use existing pantry items
- If asked about medical advice, recommend consulting healthcare professionals

Voice and length:
${
  terse
    ? `- You are read on a phone, beside a recipe card that carries every detail.
  Two or three sentences. One paragraph. Never more.
- Say three things and nothing else: why this dish, what the user already has
  for it, and what they would need to pick up.
- Never list ingredients, steps, timings, difficulty or macros. The card and the
  recipe screen carry those, and repeating them is two screens of duplicate
  text the user has to scroll past.`
    : `- You are read on a phone. Keep replies to 2-4 short paragraphs of plain prose.
- Do not restate the full ingredient list or method — the recipe card and the
  recipe screen carry those. Say why this dish, and what the user is missing.`
}
- Write NO markdown whatsoever. No asterisks, no bold, no italics, no
  underscores, no backticks, no # headings, no tables, and no bullet or
  numbered lists. Write flowing sentences instead.
- Never wrap a dish name in asterisks. Just write the name.
- Emphasis comes from specifics, not from exclamation marks or bold text.

Response Format:
- For meal plans, organize by days and meals
- For pantry advice, be specific about storage methods and timeframes
- Always provide follow-up suggestions when appropriate`;

  if (!context) return systemPrompt;

  if (context.currentPantryItems && context.currentPantryItems.length > 0) {
    systemPrompt += `\n\nUser's Current Pantry Items: ${context.currentPantryItems.join(', ')}`;
  }

  if (context.dietaryRestrictions && context.dietaryRestrictions.length > 0) {
    systemPrompt += `\n\nDietary Restrictions: ${context.dietaryRestrictions.join(', ')}`;
  }

  if (context.healthGoals && context.healthGoals.length > 0) {
    systemPrompt += `\n\nHealth Goals: ${context.healthGoals.join(', ')}`;
  }

  if (context.userPreferences) {
    const prefs = context.userPreferences;
    if (prefs.cuisinePreferences && prefs.cuisinePreferences.length > 0) {
      systemPrompt += `\n\nPreferred Cuisines: ${prefs.cuisinePreferences.join(', ')}`;
    }
    if (prefs.cookingSkillLevel) {
      systemPrompt += `\n\nCooking Skill Level: ${prefs.cookingSkillLevel}`;
    }
  }

  if (context.allergies && context.allergies.length > 0) {
    // Stated separately from dietary restrictions and much more firmly —
    // a preference can be bent, an allergy cannot.
    systemPrompt += `\n\nALLERGIES (never suggest a dish containing these, and warn about shared-equipment risk): ${context.allergies.join(', ')}`;
  }

  if (context.activeMealPlan) {
    systemPrompt += `\n\nUser has an active meal plan. Consider this when making suggestions.`;
  }

  if (context.retrievedRecipes && context.retrievedRecipes.length > 0) {
    // Grounding. Without this the model invents plausible-sounding recipes
    // that don't exist in the library and therefore can't be opened,
    // cooked, or added to a plan.
    const lines = context.retrievedRecipes.map(r => {
      const bits = [`- [${r.id}] "${r.title}"`];
      if (r.cuisine) bits.push(`(${r.cuisine})`);
      if (r.totalTime) bits.push(`${r.totalTime} min`);
      if (r.matched.length) bits.push(`| already have: ${r.matched.slice(0, 8).join(', ')}`);
      if (r.missing.length) bits.push(`| needs: ${r.missing.slice(0, 6).join(', ')}`);
      return bits.join(' ');
    });

    systemPrompt += `

## Recipes available in this user's library, best match first
${lines.join('\n')}

RULES FOR THIS TURN — these override the general guidance above:
1. Recommend ONE of the recipes listed above. Refer to it by its exact title.
   These are real recipes the user can open, cook hands-free, and add to a
   plan. A dish you invent is none of those things.
2. Do not invent a different dish unless every option above is genuinely
   unsuitable — if so, say which and why before suggesting anything else.
3. Your reply MUST end with the chosen recipe's id on its own line, exactly:
   [recipe:<id>]
   This line is removed before the user sees it — it is how the app knows which
   recipe to make tappable, so omitting it costs the user the recipe.`;
  }

  return systemPrompt;
}

export const buildSystemMessage = (context?: ChatContext): ChatMessage => ({
  role: 'system',
  content: buildSystemPrompt(context),
});

/** Which strategy identified the recipe. Reported so the weakest can be measured. */
export type RecipeRefMatch = 'marker' | 'title' | 'fuzzy' | 'none';

/**
 * Work out which library recipe the reply is recommending.
 *
 * Three strategies, because none alone is reliable. The `[recipe:<id>]` marker
 * is exact but fragile — a long reply can be truncated before it, and smaller
 * models drop formatting instructions. An exact title match catches the common
 * case after that. Neither survives a paraphrase, though, and a paraphrase is
 * what a model naturally writes: "the garlic and tomato spaghetti" for a recipe
 * stored as "Spaghetti with Garlic-Tomato Bell Pepper Sauce". That reply names
 * a real recipe and used to produce no card at all, so the third strategy
 * matches on title tokens.
 *
 * Only ids from the candidate set are ever returned, so a hallucinated id
 * cannot reach the client.
 */
export function extractRecipeRef(
  content: string,
  candidates: RetrievedRecipeContext[] = []
): { content: string; recipeId?: string; match: RecipeRefMatch } {
  // Deliberately permissive about the id's shape: this must strip the marker
  // from what the user reads no matter what the model put inside it. The id
  // is only trusted after it matches a candidate, below.
  const marker = /\[recipe:\s*([^\]\s]+)\s*\]/gi;
  const match = marker.exec(content);
  const cleaned = content.replace(/\[recipe:[^\]]*\]/gi, '').trimEnd();

  if (match) {
    const id = match[1].toLowerCase();
    if (candidates.some(c => c.id === id)) {
      return { content: cleaned, recipeId: id, match: 'marker' };
    }
  }

  // Fall back to the longest candidate title that appears in the reply —
  // longest first so "Chicken Caesar Salad" wins over a candidate merely
  // called "Chicken".
  const haystack = cleaned.toLowerCase();
  const byLength = [...candidates].sort((a, b) => b.title.length - a.title.length);
  for (const c of byLength) {
    if (c.title.length >= 6 && haystack.includes(c.title.toLowerCase())) {
      return { content: cleaned, recipeId: c.id, match: 'title' };
    }
  }

  // Finally, token overlap against the title. `normalise` already strips
  // plurals, punctuation, stopwords and short words, so a paraphrase that keeps
  // the distinctive nouns still resolves.
  const replyTokens = new Set(normalise(cleaned));
  const scored = candidates
    .map(c => {
      const titleTokens = [...new Set(normalise(c.title))];
      if (titleTokens.length < 2) return null;
      const matched = titleTokens.filter(t => replyTokens.has(t)).length;
      return { id: c.id, matched, coverage: matched / titleTokens.length };
    })
    .filter((x): x is { id: string; matched: number; coverage: number } => x !== null)
    .filter(x => x.coverage >= 0.6 && x.matched >= 2)
    .sort((a, b) => b.coverage - a.coverage || b.matched - a.matched);

  // A clear winner only. Two near-identical titles — "Chicken Curry" and
  // "Chicken Curry with Rice" — would otherwise resolve on a coin flip, and a
  // card for the wrong recipe is worse than no card.
  if (scored.length && (scored.length === 1 || scored[0].coverage - scored[1].coverage >= 0.15)) {
    return { content: cleaned, recipeId: scored[0].id, match: 'fuzzy' };
  }

  return { content: cleaned, match: 'none' };
}

function extractRecipeData(content: string) {
  // Simple regex-based extraction - could be enhanced with more sophisticated parsing
  const ingredientsMatch = content.match(
    /ingredients?:?\s*([\s\S]*?)(?=instructions?:|directions?:|method:|$)/i
  );
  const instructionsMatch = content.match(
    /(?:instructions?|directions?|method):?\s*([\s\S]*?)(?=notes?:|tips?:|$)/i
  );

  return {
    hasIngredients: !!ingredientsMatch,
    hasInstructions: !!instructionsMatch,
    rawIngredients: ingredientsMatch?.[1]?.trim(),
    rawInstructions: instructionsMatch?.[1]?.trim(),
  };
}

function extractMealPlanData(content: string) {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const meals = ['breakfast', 'lunch', 'dinner', 'snack'];

  const foundDays = days.filter(day => content.toLowerCase().includes(day));
  const foundMeals = meals.filter(meal => content.toLowerCase().includes(meal));

  return {
    daysFound: foundDays,
    mealsFound: foundMeals,
    isWeeklyPlan: foundDays.length >= 5,
  };
}

function extractShoppingListData(content: string) {
  // Look for bullet points or numbered lists
  const listItems = content.match(/(?:^|\n)\s*(?:[-*•]|\d+\.)\s*([^\n]+)/gm);

  return {
    hasListItems: !!listItems,
    itemCount: listItems?.length || 0,
    rawItems: listItems?.map(item => item.replace(/^[\s\-*•\d.]+/, '').trim()),
  };
}

function extractSuggestions(content: string): string[] {
  const suggestions: string[] = [];

  // Look for common suggestion patterns
  const suggestionPatterns = [
    /would you like me to[^?]*\?/gi,
    /i can also[^.]*\./gi,
    /you might want to[^.]*\./gi,
    /consider[^.]*\./gi,
  ];

  suggestionPatterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      suggestions.push(...matches.map(match => match.trim()));
    }
  });

  return suggestions.slice(0, 3); // Limit to 3 suggestions
}

export function parseResponse(
  rawContent: string,
  candidates: RetrievedRecipeContext[] = []
): ChatResponse {
  const { content, recipeId } = extractRecipeRef(stripMarkdown(rawContent), candidates);

  // Analyze content to determine response type
  const lowerContent = content.toLowerCase();

  let type: ChatResponse['type'] = 'text';
  let structuredData: unknown = undefined;
  let suggestions: string[] = [];

  // Check for recipe suggestions
  if (
    lowerContent.includes('recipe') ||
    lowerContent.includes('ingredients:') ||
    lowerContent.includes('instructions:')
  ) {
    type = 'recipe_suggestion';
    structuredData = extractRecipeData(content);
  }

  // Check for meal plan suggestions
  else if (
    lowerContent.includes('meal plan') ||
    lowerContent.includes('breakfast:') ||
    lowerContent.includes('lunch:') ||
    lowerContent.includes('dinner:')
  ) {
    type = 'meal_plan_suggestion';
    structuredData = extractMealPlanData(content);
  }

  // Check for pantry-related advice
  else if (
    lowerContent.includes('pantry') ||
    lowerContent.includes('storage') ||
    lowerContent.includes('expir')
  ) {
    type = 'pantry_update';
  }

  // Check for shopping list generation
  else if (
    lowerContent.includes('shopping') ||
    lowerContent.includes('grocery') ||
    lowerContent.includes('buy:')
  ) {
    type = 'shopping_list_generation';
    structuredData = extractShoppingListData(content);
  }

  // Extract follow-up suggestions
  suggestions = extractSuggestions(content);

  // A grounded recommendation is a recipe suggestion regardless of how the
  // prose happened to be worded.
  if (recipeId) type = 'recipe_suggestion';

  return {
    content,
    type,
    structuredData,
    suggestions,
    recipeId,
    confidence: 0.8,
    assumptions: [],
    compromises: [],
  };
}
