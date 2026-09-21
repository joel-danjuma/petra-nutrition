import { ChatGroq } from '@langchain/groq';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from '@langchain/core/messages';

import { config } from '../config';
import { logger } from '../utils/logger';
import type { ChatMessage } from './groq';

/**
 * The provider seam.
 *
 * Every model call in the graph resolves through `modelFor(node)`. Nodes name a
 * *role* — "the thing that classifies intent", "the thing that writes a
 * recipe" — and this file decides which model and which settings serve it. No
 * node imports `groq-sdk`, `@langchain/groq`, or a model id.
 *
 * The reason to build the seam now rather than when it is needed: the three
 * nodes want genuinely different models. Routing is a cheap classification that
 * should never touch the large model; composing a dish under hard constraints
 * is the one job worth spending on. Today both resolve to Groq because Groq's
 * free tier is what this runs on. When per-node evaluation becomes the
 * question, an OpenRouter adapter registers here and nothing above it changes —
 * including the eval harness, which can swap one node's model and leave the
 * rest of the graph fixed.
 *
 * Per-node settings are data, in MODELS below, so "which model served the
 * compose node" is answerable by reading one table rather than by grepping
 * call sites.
 */

export type NodeName =
  | 'router'
  | 'search'
  | 'compose'
  | 'nutrition'
  | 'respond'
  /** Not a graph node, but the same seam: structured extraction over an import. */
  | 'enrich';

type ProviderName = 'groq';

interface NodeModelConfig {
  provider: ProviderName;
  /** Resolved lazily, so a config change needs no rebuild of this table. */
  model: () => string;
  temperature: number;
  maxTokens: number;
  reasoningEffort?: 'none' | 'default' | 'low' | 'medium' | 'high';
  /** Ask the provider to guarantee parseable JSON where it can. */
  json?: boolean;
}

const MODELS: Record<NodeName, NodeModelConfig> = {
  /**
   * Classification, three fields, validated in code. The fast model is not a
   * compromise here — it is the correct tool, and putting routing on the large
   * model was what drained a 200k-token daily budget in an afternoon.
   */
  router: {
    provider: 'groq',
    model: () => config.GROQ_MODEL_FAST,
    temperature: 0,
    maxTokens: 400,
    reasoningEffort: 'low',
    json: true,
  },

  /** Search is a tool call over the index; the model only frames the query. */
  search: {
    provider: 'groq',
    model: () => config.GROQ_MODEL_FAST,
    temperature: 0,
    maxTokens: 300,
    reasoningEffort: 'low',
    json: true,
  },

  /**
   * The one node worth the large model. Writing a coherent method from a fixed
   * ingredient set is the actual reasoning task in this system, and a weak
   * answer here is the failure the whole graph exists to fix. Temperature is
   * low but not zero: the dish should be good, not deterministic.
   */
  compose: {
    provider: 'groq',
    model: () => config.GROQ_MODEL_SMART,
    temperature: 0.4,
    maxTokens: 3000,
    reasoningEffort: 'medium',
    json: true,
  },

  /**
   * Nutrition is arithmetic in TypeScript. The model is called for exactly one
   * thing — how many grams "2 chicken breasts" is — so it gets no room to
   * wander and no budget to spend.
   */
  nutrition: {
    provider: 'groq',
    model: () => config.GROQ_MODEL_FAST,
    temperature: 0,
    maxTokens: 600,
    reasoningEffort: 'low',
    json: true,
  },

  /** Prose the user reads. Streamed, so latency to first token dominates. */
  respond: {
    provider: 'groq',
    model: () => config.GROQ_MODEL_FAST,
    temperature: 0.7,
    maxTokens: 3000,
    reasoningEffort: 'low',
  },

  enrich: {
    provider: 'groq',
    model: () => config.GROQ_MODEL_FAST,
    temperature: 0.3,
    maxTokens: 2000,
    reasoningEffort: 'low',
    json: true,
  },
};

export interface CompletionResult {
  text: string;
  /** Which model actually served it — logged, never rendered. */
  model: string;
  tokensUsed?: number;
}

export interface CallOptions {
  signal?: AbortSignal;
  /** Override the table's model for this call — the eval harness's entry point. */
  model?: string;
}

/** What a node sees. Deliberately smaller than any provider's SDK surface. */
export interface ChatModel {
  readonly node: NodeName;
  readonly modelId: string;
  complete(messages: ChatMessage[], opts?: CallOptions): Promise<CompletionResult>;
  /**
   * Stream deltas to `onDelta` and resolve with the complete text. `onDelta`
   * receives raw deltas — sanitising them for display is the caller's job (see
   * `streamSafePrefix`), because only the caller knows whether the text is
   * headed for a screen or a parser.
   */
  stream(
    messages: ChatMessage[],
    onDelta: (delta: string) => void,
    opts?: CallOptions
  ): Promise<CompletionResult>;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Groq rate limits come back as a 429 whose message carries both the window
 * that was hit (per-minute vs per-day) and how long to wait. Surfacing that
 * distinction matters: a per-minute limit clears on its own in seconds, while a
 * per-day cap means no amount of retrying will help today.
 *
 * Duplicated in shape from `llm/groq.ts` rather than shared, because that one
 * is bound to `groq-sdk`'s error objects and this one to LangChain's wrapping
 * of them. Merging them would couple the seam to the thing it exists to
 * abstract.
 */
export function parseRateLimit(
  error: unknown
): { retryAfterMs: number; userMessage: string; perDay: boolean } | null {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  if (!/rate_limit|rate limit|429/i.test(raw)) return null;

  const m = raw.match(/try again in (?:(\d+)m)?([\d.]+)s/i);
  const retryAfterMs = m ? (Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000 : 2_000;
  const perDay = /per day|TPD|tokens per day/i.test(raw);

  return {
    retryAfterMs,
    perDay,
    userMessage: perDay
      ? "Petra has reached today's AI usage limit. It resets at midnight UTC."
      : `Petra is at its rate limit. Try again in about ${Math.max(
          1,
          Math.ceil(retryAfterMs / 1000)
        )} seconds.`,
  };
}

const toLangChain = (messages: ChatMessage[]): BaseMessage[] =>
  messages.map(m => {
    if (m.role === 'system') return new SystemMessage(m.content);
    if (m.role === 'assistant') return new AIMessage(m.content);
    return new HumanMessage(m.content);
  });

/** Pull the usage total out of whichever field the provider populated. */
const tokensFrom = (meta: unknown): number | undefined => {
  const usage = (meta as { usage_metadata?: { total_tokens?: number } } | undefined)
    ?.usage_metadata;
  return usage?.total_tokens;
};

class GroqChatModel implements ChatModel {
  readonly node: NodeName;
  readonly modelId: string;
  private readonly settings: NodeModelConfig;
  private client: ChatGroq | null = null;

  constructor(node: NodeName, settings: NodeModelConfig, modelOverride?: string) {
    this.node = node;
    this.settings = settings;
    this.modelId = modelOverride ?? settings.model();
  }

  /**
   * Built on first use rather than at construction. `modelFor` is called at
   * module scope by the nodes, and a missing GROQ_API_KEY should surface from
   * `validateConfig` at boot — not as a constructor throw during import, which
   * takes the whole process down with a stack trace pointing at the wrong file.
   */
  private model(): ChatGroq {
    if (!this.client) {
      this.client = new ChatGroq({
        apiKey: config.GROQ_API_KEY,
        model: this.modelId,
        temperature: this.settings.temperature,
        maxTokens: this.settings.maxTokens,
        topP: 0.9,
        ...(this.settings.reasoningEffort
          ? { reasoningEffort: this.settings.reasoningEffort }
          : {}),
      });
    }
    return this.client;
  }

  private callOptions(opts?: CallOptions) {
    return {
      ...(opts?.signal ? { signal: opts.signal } : {}),
      ...(this.settings.json
        ? { response_format: { type: 'json_object' as const } }
        : {}),
    };
  }

  async complete(messages: ChatMessage[], opts?: CallOptions): Promise<CompletionResult> {
    try {
      const result = await this.model().invoke(
        toLangChain(messages),
        this.callOptions(opts)
      );

      return {
        text: typeof result.content === 'string' ? result.content : String(result.content),
        model: this.modelId,
        tokensUsed: tokensFrom(result),
      };
    } catch (error) {
      throw this.translate(error, opts);
    }
  }

  async stream(
    messages: ChatMessage[],
    onDelta: (delta: string) => void,
    opts?: CallOptions
  ): Promise<CompletionResult> {
    try {
      const stream = await this.model().stream(
        toLangChain(messages),
        this.callOptions(opts)
      );

      let text = '';
      let tokensUsed: number | undefined;

      for await (const chunk of stream) {
        if (opts?.signal?.aborted) break;
        const delta =
          typeof chunk.content === 'string' ? chunk.content : String(chunk.content ?? '');
        tokensUsed = tokensFrom(chunk) ?? tokensUsed;
        if (!delta) continue;
        text += delta;
        onDelta(delta);
      }

      return { text, model: this.modelId, tokensUsed };
    } catch (error) {
      throw this.translate(error, opts);
    }
  }

  /**
   * Turn a provider error into something the graph can act on.
   *
   * A rate limit becomes a message the user can read and understand; anything
   * else becomes a generic failure, because a raw provider stack trace in a
   * chat bubble tells the reader nothing and leaks the vendor.
   */
  private translate(error: unknown, opts?: CallOptions): Error {
    if (opts?.signal?.aborted) return new Error('Stream aborted');

    const limit = parseRateLimit(error);
    if (limit) {
      logger.warn('Model provider rate limited', {
        node: this.node,
        model: this.modelId,
        perDay: limit.perDay,
        retryAfterMs: limit.retryAfterMs,
      });
      return new Error(limit.userMessage);
    }

    logger.error('Model call failed', {
      node: this.node,
      model: this.modelId,
      error: error instanceof Error ? error.message : String(error),
    });
    return new Error('AI service is currently unavailable');
  }
}

/**
 * A model that falls back to the fast one when the large one is rate limited.
 *
 * Only worth doing for a brief per-minute limit: the large model has its own,
 * separately exhausted daily budget, so a per-day cap means the fallback is the
 * only thing that will answer at all today. Wrapping rather than building the
 * retry into `GroqChatModel` keeps the retry policy visible as a decision
 * rather than buried in an adapter.
 */
class WithFastFallback implements ChatModel {
  constructor(
    private readonly primary: ChatModel,
    private readonly fallback: ChatModel
  ) {}

  get node() {
    return this.primary.node;
  }

  get modelId() {
    return this.primary.modelId;
  }

  async complete(messages: ChatMessage[], opts?: CallOptions): Promise<CompletionResult> {
    try {
      return await this.primary.complete(messages, opts);
    } catch (error) {
      if (!this.shouldFallBack(error, opts)) throw error;
      logger.warn('Falling back to the fast model', { node: this.node });
      return this.fallback.complete(messages, opts);
    }
  }

  async stream(
    messages: ChatMessage[],
    onDelta: (delta: string) => void,
    opts?: CallOptions
  ): Promise<CompletionResult> {
    try {
      return await this.primary.stream(messages, onDelta, opts);
    } catch (error) {
      if (!this.shouldFallBack(error, opts)) throw error;
      logger.warn('Falling back to the fast model mid-stream', { node: this.node });
      return this.fallback.stream(messages, onDelta, opts);
    }
  }

  private shouldFallBack(error: unknown, opts?: CallOptions): boolean {
    if (opts?.signal?.aborted) return false;
    const message = error instanceof Error ? error.message : '';
    // `translate` has already turned the provider error into one of these two.
    return /rate limit|usage limit/i.test(message);
  }
}

const cache = new Map<string, ChatModel>();

/**
 * Per-node substitutions, checked before the table.
 *
 * This is the other half of the seam, and it has two users. An eval harness
 * swaps one node's model and leaves the rest of the graph fixed, which is the
 * only way to attribute a quality change to a model rather than to the whole
 * pipeline. And a test scripts a node's output, which is what makes the
 * graph's behaviour assertable without a network, an API key, or a token
 * budget — the acceptance test for "chicken breasts, linguine, bell peppers"
 * has to run in CI, every time, offline.
 */
const overrides = new Map<NodeName, ChatModel>();

export function setModel(node: NodeName, model: ChatModel | null): void {
  if (model) overrides.set(node, model);
  else overrides.delete(node);
}

export function clearModels(): void {
  overrides.clear();
}

/** The factory every node calls. Instances are reused; they are stateless. */
export function modelFor(node: NodeName, opts?: { model?: string }): ChatModel {
  const override = overrides.get(node);
  if (override && !opts?.model) return override;

  const key = `${node}:${opts?.model ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const settings = MODELS[node];
  const primary = new GroqChatModel(node, settings, opts?.model);

  const resolved: ChatModel =
    !opts?.model && settings.model() === config.GROQ_MODEL_SMART
      ? new WithFastFallback(
          primary,
          new GroqChatModel(node, { ...settings, reasoningEffort: 'low' }, config.GROQ_MODEL_FAST)
        )
      : primary;

  cache.set(key, resolved);
  return resolved;
}

/** Test seam: drop cached instances so a config change takes effect. */
export function resetModelCache(): void {
  cache.clear();
}

/** Wait out a brief per-minute limit. Exported for the retry policies above. */
export const waitForRateLimit = sleep;
