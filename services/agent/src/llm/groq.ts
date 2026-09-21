import Groq from 'groq-sdk';
import { config } from '../config';
import { logger } from '../utils/logger';
import { buildSystemMessage, parseResponse } from './chat-prompt';
import { stripMarkdown, streamSafePrefix } from './strip-markdown';
import type {
  ChatContext,
  ChatMessage,
  ChatResponse,
  RetrievedRecipeContext,
} from './types';

/**
 * Re-exported rather than moved outright: these names are imported from
 * `llm/groq` by the routes, the orchestrator and the existing
 * `stream-safe-prefix` tests. The definitions moved to `types.ts` and
 * `strip-markdown.ts` so the graph's respond node can use them without pulling
 * in a provider client, but the import path callers already use still works.
 */
export type {
  ChatMessage,
  ChatContext,
  ChatResponse,
  RetrievedRecipeContext,
} from './types';
export { stripMarkdown, streamSafePrefix } from './strip-markdown';

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
    return buildSystemMessage(context);
  }

  private parseResponse(
    rawContent: string,
    candidates: RetrievedRecipeContext[] = []
  ): ChatResponse {
    return parseResponse(rawContent, candidates);
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
