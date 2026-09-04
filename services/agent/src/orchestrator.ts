import type {
  AgentContext,
  ChatRequest,
  ChatResponse,
} from '@petra/agent-contract';

import { AIChatService, type ChatContext, type RetrievedRecipeContext } from './llm/groq';
import { retrievalService } from './retrieval';
import { logger } from './utils/logger';

/**
 * One turn of conversation, start to finish.
 *
 * This is the whole reason the agent is worth splitting out: a pure function
 * from a request to a reply, with no database of its own beyond the recipe
 * index and no notion of sessions, users or persistence. It can be exercised in
 * a test with a literal object, which was never true of the controller it came
 * from — that one needed a database, a Redis, an authenticated request and a
 * seeded user before it would produce a single sentence.
 *
 * The API still owns everything stateful: it validates the session, persists
 * both messages, and hydrates the recipe card. It hands us context; we hand
 * back prose.
 */

const aiChatService = new AIChatService();

/**
 * Keywords that justify the large model.
 *
 * An earlier version escalated whenever retrieval returned hits — which is
 * always — on the belief that the small model ignored the shortlist. Once the
 * grounding rules were made directive both models followed them identically,
 * so that escalation bought nothing and drained a 200k-token daily budget in
 * an afternoon. This heuristic still catches the genuinely complex asks.
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
 * Retrieval failure must never fail the chat: an ungrounded reply is worse
 * than a grounded one, but far better than an error.
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

/** Translate the wire context into the shape the prompt builder expects. */
const toChatContext = (
  context: AgentContext | undefined,
  retrievedRecipes: RetrievedRecipeContext[]
): ChatContext => ({
  userPreferences: context?.userPreferences,
  currentPantryItems: context?.currentPantryItems ?? [],
  dietaryRestrictions: context?.dietaryRestrictions ?? [],
  healthGoals: context?.healthGoals ?? [],
  allergies: context?.allergies ?? [],
  activeMealPlan: context?.activeMealPlan,
  lastRecipeSearch: context?.lastRecipeSearch,
  retrievedRecipes,
});

/** The last thing the user actually said — what retrieval keys off. */
const lastUserMessage = (messages: ChatRequest['messages']): string => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content;
  }
  return '';
};

export const runChatTurn = async (request: ChatRequest): Promise<ChatResponse> => {
  const { messages, context, options } = request;
  const userMessage = lastUserMessage(messages);

  const retrievedRecipes = await retrieveForTurn(
    userMessage,
    context,
    options?.maxRetrieved ?? 6
  );

  const advanced = options?.advancedModel ?? shouldUseAdvancedModel(userMessage);

  const response = await aiChatService.sendMessage(
    messages,
    toChatContext(context, retrievedRecipes),
    advanced
  );

  return response as ChatResponse;
};

/**
 * Streaming variant. `onChunk` receives visible text as it arrives; the
 * resolved value is the same fully-parsed response the non-streaming path
 * returns, so the caller can persist one and render the other.
 */
export const runChatTurnStreaming = async (
  request: ChatRequest,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<ChatResponse> => {
  const { messages, context, options } = request;
  const userMessage = lastUserMessage(messages);

  const retrievedRecipes = await retrieveForTurn(
    userMessage,
    context,
    options?.maxRetrieved ?? 6
  );

  const advanced = options?.advancedModel ?? shouldUseAdvancedModel(userMessage);

  return aiChatService.streamChatResponse(
    messages,
    toChatContext(context, retrievedRecipes),
    onChunk,
    advanced,
    signal
  ) as Promise<ChatResponse>;
};

export { aiChatService };
