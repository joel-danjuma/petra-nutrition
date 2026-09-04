import Groq from 'groq-sdk';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatContext {
  userPreferences?: any;
  currentPantryItems?: string[];
  activeMealPlan?: string;
  lastRecipeSearch?: string;
  dietaryRestrictions?: string[];
  healthGoals?: string[];
  allergies?: string[];
  /** Recipes retrieved from the library for this turn — see RetrievalService. */
  retrievedRecipes?: RetrievedRecipeContext[];
}

export interface RetrievedRecipeContext {
  id: string;
  title: string;
  cuisine?: string | null;
  totalTime?: number;
  matched: string[];
  missing: string[];
}

export interface ChatResponse {
  content: string;
  type: 'text' | 'recipe_suggestion' | 'meal_plan_suggestion' | 'pantry_update' | 'shopping_list_generation';
  structuredData?: any;
  suggestions?: string[];
  /** Set when the reply recommends a real recipe from the library. Drives the
   *  tappable recipe card in the chat stream. */
  recipeId?: string;
  confidence?: number;
  /** Which model actually served the turn, and what it cost. Observability
   *  only — the gateway logs these, no client renders them. */
  model?: string;
  tokensUsed?: number;
}

/**
 * Remove markdown from a reply.
 *
 * The prompt forbids it and both models comply, but a stray `**dish**` reaching
 * the chat bubble renders as literal asterisks — the app has no markdown
 * renderer, and the design system rules out bold for emphasis anyway. This is
 * the belt to the prompt's braces.
 */
export function stripMarkdown(text: string): string {
  return (
    text
      // Fenced and inline code — keep the contents, drop the ticks.
      .replace(/```[a-z]*\n?([\s\S]*?)```/gi, '$1')
      .replace(/`([^`]+)`/g, '$1')
      // Emphasis, longest delimiter first so ** is consumed before *.
      .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      // Underscore italics only between word boundaries, so snake_case names
      // and ids survive intact.
      .replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,;:!?])/g, '$1$2')
      // Headings and blockquotes.
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      // Links: keep the label, drop the target.
      .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, '$1')
      // Bullets and numbered lists become sentences rather than stray glyphs.
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+[.)]\s+/gm, '')
      // Horizontal rules.
      .replace(/^\s*([-*_]\s?){3,}$/gm, '')
      // Collapse the blank lines those removals leave behind.
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * How much of a partially-received reply is safe to show the reader.
 *
 * Streaming raw deltas straight through would defeat `stripMarkdown`: the model
 * emits `**Shopska Salad**` across three chunks, and the reader watches literal
 * asterisks appear and then fail to disappear. Worse, the `[recipe:<id>]`
 * marker would be visible for the moment before its closing bracket arrives.
 *
 * So the tail is withheld from the first construct that is still open — an
 * unclosed bracket, or an odd number of emphasis runs — and released as soon as
 * the closing delimiter lands. In practice this holds back a few characters for
 * a few milliseconds and is invisible.
 */
export function streamSafePrefix(raw: string): string {
  // Completed markers are removed outright. `extractRecipeRef` does this for a
  // finished reply, but that runs only once the whole thing has arrived — mid
  // stream, nothing else would take the marker out before the reader saw it.
  const text = raw.replace(/\[recipe:[^\]]*\]/gi, '');

  let cut = text.length;

  // A marker that is still arriving is withheld along with everything after it.
  const lastOpen = text.lastIndexOf('[');
  if (lastOpen !== -1 && text.indexOf(']', lastOpen) === -1) {
    cut = Math.min(cut, lastOpen);
  }

  // Pair up delimiter runs left to right; whatever is left unmatched is still
  // open, and everything from the earliest of those onward is withheld.
  //
  // Counting runs alone is not enough, which a property test caught: while
  // `**bold**` is arriving, the string passes through the state `**bold*` —
  // two runs, an even count, apparently closed. Letting that through hands
  // `stripMarkdown` an unbalanced pair, and it emits a stray asterisk that
  // never disappears. Pairing by run length rejects that state instead.
  for (const delimiter of ['*', '_', '`']) {
    const runs = [...text.matchAll(new RegExp(`\\${delimiter}+`, 'g'))];
    const open: { index: number; length: number }[] = [];

    for (const run of runs) {
      const entry = { index: run.index ?? 0, length: run[0].length };
      const top = open[open.length - 1];

      if (top && top.length === entry.length) {
        open.pop();
      } else {
        open.push(entry);
      }
    }

    if (open.length > 0) cut = Math.min(cut, open[0].index);
  }

  return text.slice(0, cut);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Groq rate limits come back as a 429 whose message carries both the window
 * that was hit (per-minute vs per-day) and how long to wait. Surfacing that
 * distinction matters: a per-minute limit clears on its own in seconds, while a
 * per-day cap means no amount of retrying will help today.
 */
function parseRateLimit(error: unknown): { retryAfterMs: number; userMessage: string } | null {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  if (!/rate_limit|rate limit|429/i.test(raw)) return null;

  // "Please try again in 1m7.391999999s" / "in 12.5s"
  const m = raw.match(/try again in (?:(\d+)m)?([\d.]+)s/i);
  const retryAfterMs = m
    ? (Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000
    : 2_000;

  const perDay = /per day|TPD|tokens per day/i.test(raw);
  const userMessage = perDay
    ? "Petra has reached today's AI usage limit. It resets at midnight UTC."
    : `Petra is at its rate limit. Try again in about ${Math.max(1, Math.ceil(retryAfterMs / 1000))} seconds.`;

  return { retryAfterMs, userMessage };
}

export class AIChatService {
  private groq: Groq;
  private modelFast = config.GROQ_MODEL_FAST;
  private modelSmart = config.GROQ_MODEL_SMART;

  constructor() {
    if (!config.GROQ_API_KEY) {
      throw new Error('GroqAPI key not configured');
    }

    this.groq = new Groq({
      apiKey: config.GROQ_API_KEY,
    });
  }

  async sendMessage(
    messages: ChatMessage[],
    context?: ChatContext,
    useAdvancedModel: boolean = false
  ): Promise<ChatResponse> {
    try {
      const systemMessage = this.buildSystemMessage(context);
      const fullMessages = [systemMessage, ...messages];

      const model = useAdvancedModel ? this.modelSmart : this.modelFast;

      const response = await this.groq.chat.completions.create({
        messages: fullMessages as any,
        model,
        temperature: 0.7,
        // Generous because gpt-oss spends part of this budget on hidden
        // reasoning tokens; the visible reply was being cut mid-sentence at
        // 1200. `reasoning_effort` keeps that share small.
        max_tokens: 3000,
        top_p: 0.9,
        stream: false,
        ...({ reasoning_effort: 'low' } as any),
      });

      const content = response.choices[0]?.message?.content || '';
      
      // Parse response to determine type and extract structured data
      const chatResponse = this.parseResponse(content, context?.retrievedRecipes ?? []);

      logger.info('AI chat response generated', {
        model,
        messageCount: messages.length,
        responseType: chatResponse.type,
        tokensUsed: response.usage?.total_tokens,
      });

      return { ...chatResponse, model, tokensUsed: response.usage?.total_tokens };
    } catch (error) {
      logger.error('AI chat service error:', error);

      const limit = parseRateLimit(error);
      if (limit) {
        // Retry once on the fast model. The large model has its own, separately
        // exhausted daily budget, so falling back to the cheaper one recovers a
        // turn that would otherwise just fail in the user's face.
        if (useAdvancedModel && limit.retryAfterMs < 5_000) {
          logger.warn('Rate limited on the large model; retrying on the fast one', {
            waitMs: limit.retryAfterMs,
          });
          await sleep(limit.retryAfterMs);
          return this.sendMessage(messages, context, false);
        }
        throw new Error(limit.userMessage);
      }

      throw new Error('AI service is currently unavailable');
    }
  }

  /**
   * Stream a turn and still return the fully parsed response.
   *
   * The older `streamMessage` resolved to a bare string, which meant the
   * streaming path could not produce a recipe card or a response type — the
   * caller got prose and nothing else. This resolves to the same `ChatResponse`
   * the non-streaming path returns, so the gateway can persist one object and
   * the client can render the card.
   *
   * `onChunk` receives sanitised text only (see `streamSafePrefix`). The
   * resolved response is authoritative: a client should replace whatever it
   * accumulated with `content` when the stream completes, which makes any
   * streaming imperfection self-correcting.
   *
   * `signal` propagates a client hang-up all the way to Groq. Without it, a
   * user closing the tab left the model generating tokens nobody would read —
   * billed against a 200k-per-day budget.
   */
  async streamChatResponse(
    messages: ChatMessage[],
    context: ChatContext | undefined,
    onChunk: (text: string) => void,
    useAdvancedModel = false,
    signal?: AbortSignal
  ): Promise<ChatResponse> {
    const systemMessage = this.buildSystemMessage(context);
    const fullMessages = [systemMessage, ...messages];
    const model = useAdvancedModel ? this.modelSmart : this.modelFast;

    try {
      // `reasoning_effort` isn't in this SDK version's types, and casting the
      // params object erases the `stream: true` literal the overload needs — so
      // the stream's shape is asserted here instead.
      const stream = (await this.groq.chat.completions.create(
        {
          messages: fullMessages as any,
          model,
          temperature: 0.7,
          max_tokens: 3000,
          top_p: 0.9,
          stream: true,
          reasoning_effort: 'low',
        } as any,
        signal ? { signal } : undefined
      )) as unknown as AsyncIterable<{
        choices: { delta?: { content?: string } }[];
        usage?: { total_tokens?: number };
      }>;

      let raw = '';
      let emitted = '';
      let tokensUsed: number | undefined;

      for await (const chunk of stream) {
        if (signal?.aborted) break;

        const delta = chunk.choices[0]?.delta?.content || '';
        if (chunk.usage?.total_tokens) tokensUsed = chunk.usage.total_tokens;
        if (!delta) continue;

        raw += delta;

        const safe = stripMarkdown(streamSafePrefix(raw));
        if (safe.length > emitted.length && safe.startsWith(emitted)) {
          onChunk(safe.slice(emitted.length));
          emitted = safe;
        }
      }

      const parsed = this.parseResponse(raw, context?.retrievedRecipes ?? []);

      // Release whatever the safety margin was still holding back.
      if (parsed.content.startsWith(emitted) && parsed.content.length > emitted.length) {
        onChunk(parsed.content.slice(emitted.length));
      }

      logger.info('AI chat stream completed', {
        model,
        messageCount: messages.length,
        contentLength: parsed.content.length,
        aborted: signal?.aborted ?? false,
        tokensUsed,
      });

      return { ...parsed, model, tokensUsed };
    } catch (error) {
      if (signal?.aborted) {
        logger.info('AI chat stream aborted by client', { model });
        throw new Error('Stream aborted');
      }

      logger.error('AI chat stream error:', error);

      const limit = parseRateLimit(error);
      throw new Error(limit ? limit.userMessage : 'AI streaming service is currently unavailable');
    }
  }

  private buildSystemMessage(context?: ChatContext): ChatMessage {
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
- Provide practical, actionable advice
- When suggesting recipes, include prep time, cook time, and difficulty level
- For meal planning, consider nutritional balance and variety
- Be mindful of food waste and suggest ways to use existing pantry items
- If asked about medical advice, recommend consulting healthcare professionals

Voice and length:
- You are read on a phone. Keep replies to 2-4 short paragraphs of plain prose.
- Write NO markdown whatsoever. No asterisks, no bold, no italics, no
  underscores, no backticks, no # headings, no tables, and no bullet or
  numbered lists. Write flowing sentences instead.
- Never wrap a dish name in asterisks. Just write the name.
- Emphasis comes from specifics, not from exclamation marks or bold text.
- Do not restate the full ingredient list or method — the recipe card and the
  recipe screen carry those. Say why this dish, and what the user is missing.

Response Format:
- For meal plans, organize by days and meals
- For pantry advice, be specific about storage methods and timeframes
- Always provide follow-up suggestions when appropriate`;

    if (context) {
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
3. End your reply with the chosen recipe's id on its own line, exactly:
   [recipe:<id>]
4. Do not list the full ingredients or method. Say why this dish suits tonight,
   what the user already has for it, and what they'd need to pick up.`;
      }
    }

    return {
      role: 'system',
      content: systemPrompt,
    };
  }

  /**
   * Work out which library recipe the reply is recommending.
   *
   * Two strategies, because neither alone is reliable. The `[recipe:<id>]`
   * marker is exact but fragile — a long reply can be truncated before it, and
   * smaller models drop formatting instructions. So if the marker is absent we
   * fall back to matching the retrieved candidates' titles against the prose,
   * which is what actually identifies the dish to a reader anyway.
   *
   * Only ids from the candidate set are ever returned, so a hallucinated id
   * cannot reach the client.
   */
  private extractRecipeRef(
    content: string,
    candidates: RetrievedRecipeContext[] = []
  ): { content: string; recipeId?: string } {
    // Deliberately permissive about the id's shape: this must strip the marker
    // from what the user reads no matter what the model put inside it. The id
    // is only trusted after it matches a candidate, below.
    const marker = /\[recipe:\s*([^\]\s]+)\s*\]/gi;
    const match = marker.exec(content);
    const cleaned = content.replace(/\[recipe:[^\]]*\]/gi, '').trimEnd();

    if (match) {
      const id = match[1].toLowerCase();
      if (candidates.some(c => c.id === id)) return { content: cleaned, recipeId: id };
    }

    // Fall back to the longest candidate title that appears in the reply —
    // longest first so "Chicken Caesar Salad" wins over a candidate merely
    // called "Chicken".
    const haystack = cleaned.toLowerCase();
    const byLength = [...candidates].sort((a, b) => b.title.length - a.title.length);
    for (const c of byLength) {
      if (c.title.length >= 6 && haystack.includes(c.title.toLowerCase())) {
        return { content: cleaned, recipeId: c.id };
      }
    }

    return { content: cleaned };
  }

  private parseResponse(
    rawContent: string,
    candidates: RetrievedRecipeContext[] = []
  ): ChatResponse {
    const { content, recipeId } = this.extractRecipeRef(stripMarkdown(rawContent), candidates);

    // Analyze content to determine response type
    const lowerContent = content.toLowerCase();

    let type: ChatResponse['type'] = 'text';
    let structuredData: any = undefined;
    let suggestions: string[] = [];

    // Check for recipe suggestions
    if (lowerContent.includes('recipe') || lowerContent.includes('ingredients:') || lowerContent.includes('instructions:')) {
      type = 'recipe_suggestion';
      structuredData = this.extractRecipeData(content);
    }
    
    // Check for meal plan suggestions
    else if (lowerContent.includes('meal plan') || lowerContent.includes('breakfast:') || lowerContent.includes('lunch:') || lowerContent.includes('dinner:')) {
      type = 'meal_plan_suggestion';
      structuredData = this.extractMealPlanData(content);
    }
    
    // Check for pantry-related advice
    else if (lowerContent.includes('pantry') || lowerContent.includes('storage') || lowerContent.includes('expir')) {
      type = 'pantry_update';
    }
    
    // Check for shopping list generation
    else if (lowerContent.includes('shopping') || lowerContent.includes('grocery') || lowerContent.includes('buy:')) {
      type = 'shopping_list_generation';
      structuredData = this.extractShoppingListData(content);
    }

    // Extract follow-up suggestions
    suggestions = this.extractSuggestions(content);

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
    };
  }

  private extractRecipeData(content: string): any {
    // Simple regex-based extraction - could be enhanced with more sophisticated parsing
    const ingredientsMatch = content.match(/ingredients?:?\s*([\s\S]*?)(?=instructions?:|directions?:|method:|$)/i);
    const instructionsMatch = content.match(/(?:instructions?|directions?|method):?\s*([\s\S]*?)(?=notes?:|tips?:|$)/i);
    
    return {
      hasIngredients: !!ingredientsMatch,
      hasInstructions: !!instructionsMatch,
      rawIngredients: ingredientsMatch?.[1]?.trim(),
      rawInstructions: instructionsMatch?.[1]?.trim(),
    };
  }

  private extractMealPlanData(content: string): any {
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

  private extractShoppingListData(content: string): any {
    // Look for bullet points or numbered lists
    const listItems = content.match(/(?:^|\n)\s*(?:[-*•]|\d+\.)\s*([^\n]+)/gm);
    
    return {
      hasListItems: !!listItems,
      itemCount: listItems?.length || 0,
      rawItems: listItems?.map(item => item.replace(/^[\s\-*•\d.]+/, '').trim()),
    };
  }

  private extractSuggestions(content: string): string[] {
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

  // Generate recipe based on ingredients
  async generateRecipe(ingredients: string[], preferences?: any): Promise<ChatResponse> {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: `Please create a recipe using these ingredients: ${ingredients.join(', ')}. ${
          preferences?.difficulty ? `Make it ${preferences.difficulty} difficulty.` : ''
        } ${
          preferences?.cuisine ? `I prefer ${preferences.cuisine} cuisine.` : ''
        } ${
          preferences?.maxTime ? `I have about ${preferences.maxTime} minutes to cook.` : ''
        }`,
      },
    ];

    return this.sendMessage(messages, undefined, true); // Use advanced model for recipe generation
  }

  // Generate meal plan
  async generateMealPlan(days: number, preferences?: any, context?: ChatContext): Promise<ChatResponse> {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: `Please create a ${days}-day meal plan for me. ${
          preferences?.targetCalories ? `Target about ${preferences.targetCalories} calories per day.` : ''
        } ${
          preferences?.mealsPerDay ? `Include ${preferences.mealsPerDay.join(', ')} each day.` : 'Include breakfast, lunch, and dinner.'
        } ${
          preferences?.complexity ? `Keep recipes ${preferences.complexity}.` : ''
        }`,
      },
    ];

    return this.sendMessage(messages, context, true); // Use advanced model for meal planning
  }

  // Get cooking tips
  async getCookingTips(topic: string): Promise<ChatResponse> {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: `Can you give me some cooking tips about ${topic}?`,
      },
    ];

    return this.sendMessage(messages);
  }

  // Analyze nutrition
  async analyzeNutrition(foodItems: string[]): Promise<ChatResponse> {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: `Can you analyze the nutritional value of these foods and suggest how to make a balanced meal: ${foodItems.join(', ')}?`,
      },
    ];

    return this.sendMessage(messages, undefined, true);
  }
}
