import type { ChatRequest, ChatResponse } from '@petra/agent-contract';

import { NotFoundError } from '../middleware/error';
import { ChatService } from './chat';
import {
  AgentContextService,
  agentContext,
  agentUser,
  type SuppliedContext,
} from './agent-context';

/**
 * `ChatMessage.content` is a Json column holding either a plain string (older
 * rows) or an array of `{ type: 'text', text }` blocks. Flatten either shape to
 * the string the model and the clients want.
 */
export function messageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(block =>
        block && typeof block === 'object' && 'text' in block
          ? String((block as { text: unknown }).text ?? '')
          : ''
      )
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

export interface BeginTurn {
  sessionId: string;
  user: { id: string; subscriptionTier?: string | null };
  content: string;
  historyLimit?: number;
  supplied?: SuppliedContext;
}

/**
 * The stateful half of one chat turn: everything the API does around the
 * agent call, in the order it has to happen.
 *
 * `begin` checks the session belongs to the caller, stores the user's message
 * and returns the agent request built from the stored history. `complete`
 * stores the reply. Between the two the caller talks to the agent however it
 * likes — a single call, or a proxied stream — which is the only part that
 * genuinely differs between the chat endpoints.
 *
 * This sequence used to be written out three times in the chat controller, and
 * the copies disagreed: the streamed and opening-message paths stored replies
 * without their structured data, and the opening message once dropped the
 * recipe id. One implementation cannot disagree with itself.
 */
export class ChatTurn {
  constructor(
    private readonly chatService = new ChatService(),
    private readonly contextService: AgentContextService = agentContext
  ) {}

  async begin({
    sessionId,
    user,
    content,
    historyLimit = 10,
    supplied,
  }: BeginTurn): Promise<ChatRequest> {
    if (!(await this.chatService.isOwner(sessionId, user.id))) {
      throw new NotFoundError('Chat session');
    }

    await this.chatService.addMessage(sessionId, {
      role: 'USER',
      content: [{ type: 'text', text: content }],
      timestamp: new Date(),
    });

    const [context, history] = await Promise.all([
      this.contextService.forUser(user.id, supplied),
      this.chatService.getRecentMessages(sessionId, historyLimit),
    ]);

    return {
      messages: history.map(msg => ({
        role: msg.role.toLowerCase() as ChatRequest['messages'][number]['role'],
        content: messageText(msg.content),
      })),
      user: agentUser(user),
      context,
    };
  }

  complete(sessionId: string, reply: ChatResponse) {
    return this.chatService.addMessage(sessionId, {
      role: 'ASSISTANT',
      content: [{ type: 'text', text: reply.content }],
      timestamp: new Date(),
      metadata: {
        type: reply.type,
        confidence: reply.confidence,
        structuredData: reply.structuredData,
        // Drives the tappable recipe card in the chat stream.
        recipeId: reply.recipeId,
      },
    });
  }
}
