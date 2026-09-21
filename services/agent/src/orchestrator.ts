import { randomUUID } from 'node:crypto';

import type {
  AgentContext,
  ChatRequest,
  ChatResponse,
  GraphNode,
} from '@petra/agent-contract';

import { AIChatService, type RetrievedRecipeContext } from './llm/groq';
import { RECURSION_LIMIT, chatGraph } from './graph';
import { lastUserMessage } from './graph/state';
import { withTurnContext } from './graph/turn-context';
import { retrievalService } from './retrieval';
import { logger } from './utils/logger';

/**
 * One turn of conversation, start to finish.
 *
 * Still a pure function from a request to a reply, with no database of its own
 * beyond the recipe index and no notion of sessions, users or persistence. It
 * can be exercised in a test with a literal object, which was never true of
 * the controller it came from. What changed is what happens inside: the turn is
 * now a graph rather than a single model call, so retrieval that misses has
 * somewhere to go.
 *
 * The signatures are deliberately identical to the pre-graph ones.
 * `services/api` and both clients are untouched: the same request goes in, the
 * same `ChatResponse` comes out, with new *optional* fields on it. A client
 * that ignores `generatedRecipe` and `nutrition` sees exactly what it saw
 * before.
 *
 * The API still owns everything stateful: it validates the session, persists
 * both messages, and hydrates the recipe card. It hands us context; we hand
 * back prose.
 */

const aiChatService = new AIChatService();

/**
 * Keywords that justify the large model.
 *
 * Retained for `options.advancedModel` and for the single-shot endpoints that
 * still call `AIChatService` directly. Inside the graph, model choice is a
 * per-node decision in `llm/provider.ts` — the compose node gets the large
 * model because composing under constraints is the actual reasoning task, and
 * the router gets the fast one because classification never needed more.
 */
const ADVANCED_KEYWORDS = [
  'meal plan',
  'nutrition',
  'complex recipe',
  'detailed analysis',
  'multiple days',
  'comprehensive',
  'elaborate',
];

export const shouldUseAdvancedModel = (content: string): boolean =>
  ADVANCED_KEYWORDS.some(keyword => content.toLowerCase().includes(keyword));

/**
 * Run retrieval for this turn and shape the hits for the prompt.
 *
 * Kept because `POST /v1/recipes/retrieve` and the meal-plan path still want
 * exactly this, and because its contract — retrieval failure must never fail
 * the chat — is now a graph-level policy in `nodes/search.ts` rather than a
 * property of one function. An ungrounded reply is worse than a grounded one,
 * but far better than an error.
 */
export const retrieveForTurn = async (
  userMessage: string,
  context: AgentContext | undefined,
  limit: number
): Promise<RetrievedRecipeContext[]> => {
  if (!userMessage) return [];

  try {
    const hits = await retrievalService.search({
      query: userMessage,
      pantry: context?.pantryNames ?? context?.currentPantryItems ?? [],
      allergies: context?.allergies ?? [],
      dietaryRestrictions: context?.dietaryRestrictions ?? [],
      limit,
    });

    return hits.map(h => ({
      id: h.id,
      title: h.title,
      cuisine: h.cuisine,
      totalTime: h.totalTime,
      matched: h.matched,
      missing: h.missing,
    }));
  } catch (error) {
    logger.warn('Recipe retrieval failed; continuing ungrounded', error);
    return [];
  }
};

/**
 * The graph thread this turn belongs to.
 *
 * The API's session id when there is one, so the checkpointed channels line up
 * with the conversation the user is actually having. A random id otherwise,
 * which makes the turn self-contained — the correct behaviour for a one-off
 * call, and the reason nothing here needs a session to work.
 *
 * Note the agent is *told* the thread id; it never derives one from a user id.
 * It has no user table to derive it from, and that is the point.
 */
const threadFor = (request: ChatRequest): string =>
  request.options?.threadId ?? `turn-${randomUUID()}`;

interface RunOptions {
  onChunk?: (text: string) => void;
  onNode?: (node: GraphNode, label: string) => void;
  onInterrupt?: (question: string, options: string[]) => void;
  signal?: AbortSignal;
}

/**
 * Invoke the graph and return its response envelope.
 *
 * `response` being null means every node ran and none produced a reply, which
 * is a wiring bug rather than a state worth rendering — so it throws instead of
 * handing the client an empty bubble to display.
 */
async function runGraph(request: ChatRequest, options: RunOptions): Promise<ChatResponse> {
  const { messages, context, options: requestOptions } = request;
  const userMessage = lastUserMessage(messages);
  const started = Date.now();

  const final = await withTurnContext(options, () =>
    chatGraph().invoke(
      { messages, context, options: requestOptions, userMessage, userId: request.user.id },
      {
        configurable: { thread_id: threadFor(request) },
        recursionLimit: RECURSION_LIMIT,
        ...(options.signal ? { signal: options.signal } : {}),
      }
    )
  );

  if (!final.response) {
    logger.error('Graph completed without a response', {
      intent: final.intent,
      hasDraft: !!final.draft,
    });
    throw new Error('AI service is currently unavailable');
  }

  logger.info('Graph turn complete', {
    intent: final.intent,
    type: final.response.type,
    composeAttempts: final.composeAttempts,
    durationMs: Date.now() - started,
    tokensUsed: final.tokensUsed,
  });

  return final.response;
}

export const runChatTurn = async (request: ChatRequest): Promise<ChatResponse> =>
  runGraph(request, {});

/**
 * Streaming variant. `onChunk` receives visible text as it arrives; the
 * resolved value is the same fully-parsed response the non-streaming path
 * returns, so the caller can persist one and render the other.
 *
 * `onNode` and `onInterrupt` are optional and additive. The signature keeps its
 * original three parameters in their original positions, so `routes/stream.ts`
 * and anything else calling it compiles unchanged.
 */
export const runChatTurnStreaming = async (
  request: ChatRequest,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  events?: {
    onNode?: (node: GraphNode, label: string) => void;
    onInterrupt?: (question: string, options: string[]) => void;
  }
): Promise<ChatResponse> =>
  runGraph(request, {
    onChunk,
    signal,
    ...(events?.onNode ? { onNode: events.onNode } : {}),
    ...(events?.onInterrupt ? { onInterrupt: events.onInterrupt } : {}),
  });

export { aiChatService };
