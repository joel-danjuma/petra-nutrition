import type { ChatResponse } from '@petra/agent-contract';

import { logger } from '../../utils/logger';
import type { GraphStateType, GraphUpdate } from '../state';
import { emitChunk, emitInterrupt } from '../turn-context';

/**
 * Ask one question and end the turn.
 *
 * Deliberately *not* a LangGraph `interrupt()`. A real interrupt parks the
 * graph mid-run and needs a resume call carrying the answer — but the API owns
 * the transcript and the client already has a perfectly good mechanism for
 * getting an answer from a user, which is the next message. Parking server-side
 * state to re-enter a graph that will re-derive everything cheaply anyway buys
 * nothing and adds a resume path that can strand a conversation if the client
 * never comes back.
 *
 * So the question goes out as an `interrupt` stream frame and as the reply
 * itself, and the user's answer arrives as an ordinary next turn with the
 * question in the history. The router sees both and routes accordingly.
 *
 * The bar for getting here is high, and it is set in the router's prompt:
 * only when the answer materially forks the dish. Asking about something that
 * could have been assumed and stated is worse than assuming it, because it
 * costs the user a round trip to tell us what we could have decided.
 */
export async function clarify(state: GraphStateType): Promise<GraphUpdate> {
  const clarification = state.clarification;

  // Routing here without a question is a wiring bug; answering with an empty
  // bubble would hide it.
  if (!clarification) {
    logger.warn('Clarify node reached with no question; falling through to chat');
    return {};
  }

  logger.info('Turn ended with a clarifying question', {
    options: clarification.options.length,
  });

  emitInterrupt(clarification.question, clarification.options);
  // Also streamed as ordinary text, so a client that ignores `interrupt`
  // frames still shows the question rather than an empty reply.
  emitChunk(clarification.question);

  const response: ChatResponse = {
    content: clarification.question,
    type: 'text',
    suggestions: clarification.options,
    confidence: 1,
    assumptions: [],
    compromises: [],
    model: state.model,
    tokensUsed: state.tokensUsed,
  };

  return { response };
}
