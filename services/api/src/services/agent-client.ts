import http from 'http';
import https from 'https';
import {
  AGENT_INTERNAL_KEY_HEADER,
  type AnalyzeNutritionRequest,
  type ChatRequest,
  type ChatResponse,
  type CookingTipsRequest,
  type EnrichRecipeRequest,
  type EnrichRecipeResponse,
  type GenerateMealPlanRequest,
  type GenerateRecipeRequest,
  type RetrieveRequest,
  type RetrievedRecipe,
  type VisionRequest,
  type VisionResponse,
} from '@petra/agent-contract';

import { config } from '../config';
import { UpstreamUnavailableError, ServiceUnavailableError, CustomError } from '../middleware/error';
import { logger } from '../utils/logger';

/**
 * The API's client for the agent service.
 *
 * Everything inference-shaped now happens over this hop. Three properties are
 * deliberate:
 *
 * - **Keep-alive.** Chat is the hottest path in the app; without a pooled
 *   connection every turn would pay a TCP handshake it does not need to.
 * - **Explicit timeouts, tiered by what is being waited on.** This is the real
 *   risk of the split, not latency: an agent that hangs without a timeout would
 *   hold API request handlers open until the pool is exhausted, taking down
 *   pantry and auth along with chat.
 * - **No retries on generation.** An LLM call is not idempotent, and a retry
 *   doubles token spend against a daily budget. The agent already retries a
 *   rate-limited turn internally, where it can see the retry-after. Here, a
 *   failure is a failure.
 */

const TIMEOUTS = {
  health: 2_000,
  /** Groq is genuinely slow; this is a ceiling, not an expectation. */
  chat: 60_000,
  vision: 30_000,
  retrieve: 10_000,
} as const;

const keepAliveAgent = config.AGENT_URL.startsWith('https')
  ? new https.Agent({ keepAlive: true, maxSockets: 32 })
  : new http.Agent({ keepAlive: true, maxSockets: 32 });

interface AgentEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

class AgentClient {
  private readonly baseUrl = config.AGENT_URL.replace(/\/$/, '');

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.INTERNAL_API_KEY) {
      headers[AGENT_INTERNAL_KEY_HEADER] = config.INTERNAL_API_KEY;
    }
    return headers;
  }

  private async post<T>(
    path: string,
    body: unknown,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // A client hang-up on the API should abort the agent call too, rather than
    // leaving the model generating for nobody.
    signal?.addEventListener('abort', () => controller.abort(), { once: true });

    const started = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
        // @ts-expect-error -- undici honours a Node agent here; the DOM types don't model it.
        agent: keepAliveAgent,
      });

      const payload = (await response.json()) as AgentEnvelope<T>;

      logger.debug('Agent call complete', {
        path,
        status: response.status,
        agentLatencyMs: Date.now() - started,
      });

      if (!response.ok || !payload.success) {
        throw new CustomError(
          payload.error?.message || `Agent returned ${response.status}`,
          response.status >= 400 && response.status < 500 ? response.status : 502,
          payload.error?.code || 'AGENT_ERROR'
        );
      }

      return payload.data as T;
    } catch (error) {
      if (error instanceof CustomError) throw error;

      if ((error as Error)?.name === 'AbortError') {
        // Distinguish "we gave up waiting" from "nothing was listening": the
        // first is worth retrying later, the second means a broken deploy.
        logger.error('Agent call timed out', { path, timeoutMs });
        throw new ServiceUnavailableError('AI');
      }

      logger.error('Agent unreachable', { path, message: (error as Error)?.message });
      throw new UpstreamUnavailableError('assistant');
    } finally {
      clearTimeout(timer);
    }
  }

  /** Cheap liveness probe, used by the API's own /health and at boot. */
  async health(): Promise<{ ok: boolean; detail?: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUTS.health);

    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
        // @ts-expect-error -- see above.
        agent: keepAliveAgent,
      });
      if (!response.ok) return { ok: false };
      return { ok: true, detail: await response.json() };
    } catch {
      return { ok: false };
    } finally {
      clearTimeout(timer);
    }
  }

  chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    return this.post<ChatResponse>('/v1/chat', request, TIMEOUTS.chat, signal);
  }

  /**
   * Open the agent's SSE stream and hand back the raw response so the caller
   * can pipe it. Deliberately returns the `Response` rather than parsing: the
   * whole point is to forward bytes without buffering them here.
   */
  async chatStream(request: ChatRequest, signal: AbortSignal): Promise<Response> {
    const response = await fetch(`${this.baseUrl}/v1/chat/stream`, {
      method: 'POST',
      headers: { ...this.headers(), Accept: 'text/event-stream' },
      body: JSON.stringify(request),
      signal,
      // @ts-expect-error -- see above.
      agent: keepAliveAgent,
    });

    if (!response.ok || !response.body) {
      throw new UpstreamUnavailableError('assistant');
    }

    return response;
  }

  retrieve(request: RetrieveRequest): Promise<{ recipes: RetrievedRecipe[] }> {
    return this.post('/v1/recipes/retrieve', request, TIMEOUTS.retrieve);
  }

  generateRecipe(request: GenerateRecipeRequest): Promise<ChatResponse> {
    return this.post('/v1/recipes/generate', request, TIMEOUTS.chat);
  }

  enrichRecipe(request: EnrichRecipeRequest): Promise<EnrichRecipeResponse> {
    return this.post('/v1/recipes/enrich', request, TIMEOUTS.chat);
  }

  generateMealPlan(request: GenerateMealPlanRequest): Promise<ChatResponse> {
    return this.post('/v1/meal-plans/generate', request, TIMEOUTS.chat);
  }

  cookingTips(request: CookingTipsRequest): Promise<ChatResponse> {
    return this.post('/v1/cooking-tips', request, TIMEOUTS.chat);
  }

  analyzeNutrition(request: AnalyzeNutritionRequest): Promise<ChatResponse> {
    return this.post('/v1/nutrition/analyze', request, TIMEOUTS.chat);
  }

  recognizeImage(request: VisionRequest): Promise<VisionResponse> {
    return this.post('/v1/vision/pantry-items', request, TIMEOUTS.vision);
  }
}

export const agentClient = new AgentClient();
export { AgentClient };
