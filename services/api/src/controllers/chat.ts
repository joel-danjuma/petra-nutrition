import { Request, Response } from 'express';
import { pipeline } from 'stream/promises';

import { ChatService } from '../services/chat';
import { agentClient } from '../services/agent-client';
import { buildCallerContext } from '../services/caller-context';
import {
  ChatTurns,
  messageText,
  type AgentPort,
} from '../services/chat-turn';
import { NotFoundError } from '../middleware/error';
import { logger } from '../utils/logger';

/**
 * Chat, after the split.
 *
 * Session CRUD lives here. A *turn* — persisting the question, asking the
 * agent, persisting the answer, hydrating the recipe card — lives in
 * `ChatTurns` (`services/chat-turn.ts`), and the two turn endpoints below are
 * only its HTTP framing: status codes, SSE headers, the pipe, and aborting the
 * agent call when the client hangs up.
 *
 * Note what did *not* change: the request and response shapes. Mobile and web
 * cannot tell that anything moved.
 */
export class ChatController {
  private chatService: ChatService;
  private turns: ChatTurns;

  /** `agent` is injectable so a test can run a whole turn against a fake. */
  constructor(agent: AgentPort = agentClient) {
    this.chatService = new ChatService();
    this.turns = new ChatTurns(agent, this.chatService);
  }

  async getSessions(req: Request, res: Response) {
    const userId = req.user!.id;
    const {
      query,
      isActive,
      fromDate,
      toDate,
      page = 1,
      limit = 20,
    } = req.query;

    try {
      const filters = {
        query: query as string,
        isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
        fromDate: fromDate ? new Date(fromDate as string) : undefined,
        toDate: toDate ? new Date(toDate as string) : undefined,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
      };

      const result = await this.chatService.getSessions(userId, filters);

      res.json({
        success: true,
        data: result,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to get chat sessions:', error);
      throw error;
    }
  }

  async getSession(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      const session = await this.chatService.getSession(id, userId);

      if (!session) {
        throw new NotFoundError('Chat session');
      }

      res.json({
        success: true,
        data: session,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to get chat session:', error);
      throw error;
    }
  }

  async createSession(req: Request, res: Response) {
    const userId = req.user!.id;
    const { title, initialMessage } = req.body;

    try {
      // Read once and used twice: the session keeps a snapshot, and the
      // opening message (if any) is sent with the same context.
      const caller = await buildCallerContext(req.user!);
      const sessionData = {
        userId,
        title: title || null,
        isActive: true,
        context: caller.context,
      };

      const session = await this.chatService.createSession(sessionData);

      // The opening message is an ordinary turn — same persistence, same
      // stored metadata — run with the context the session was created with.
      if (initialMessage) {
        await this.turns.reply({
          caller: req.user!,
          sessionId: session.id,
          text: messageText(initialMessage),
          callerContext: caller,
        });
      }

      logger.info('Chat session created', {
        userId,
        sessionId: session.id,
        hasInitialMessage: !!initialMessage,
      });

      res.status(201).json({
        success: true,
        data: session,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to create chat session:', error);
      throw error;
    }
  }

  async updateSession(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;
    const updates = req.body;

    try {
      const session = await this.chatService.updateSession(id, userId, updates);

      if (!session) {
        throw new NotFoundError('Chat session');
      }

      logger.info('Chat session updated', {
        userId,
        sessionId: id,
      });

      res.json({
        success: true,
        data: session,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to update chat session:', error);
      throw error;
    }
  }

  async deleteSession(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      const deleted = await this.chatService.deleteSession(id, userId);

      if (!deleted) {
        throw new NotFoundError('Chat session');
      }

      logger.info('Chat session deleted', {
        userId,
        sessionId: id,
      });

      res.json({
        success: true,
        data: {
          message: 'Chat session deleted successfully',
        },
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to delete chat session:', error);
      throw error;
    }
  }

  async clearMessages(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      const session = await this.chatService.clearMessages(id, userId);

      if (!session) {
        throw new NotFoundError('Chat session');
      }

      logger.info('Chat messages cleared', {
        userId,
        sessionId: id,
      });

      res.json({
        success: true,
        data: session,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to clear chat messages:', error);
      throw error;
    }
  }

  async sendMessage(req: Request, res: Response) {
    const { sessionId, context: requestContext } = req.body;

    try {
      const turn = await this.turns.reply({
        caller: req.user!,
        sessionId,
        // `message` is accepted as an alias for `content`: the mobile client
        // sends that name, and rejecting it was a contract mismatch, not a bad
        // request.
        text: messageText(req.body.content ?? req.body.message),
        requestContext,
      });

      res.json({
        success: true,
        data: turn,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to send chat message:', error);
      throw error;
    }
  }

  /**
   * Proxy the agent's SSE stream straight through to the client.
   *
   * The bytes are piped, not buffered and re-emitted: `pipeline` propagates
   * backpressure, errors and close in both directions, which a hand-rolled
   * `for await` loop over chunks does not. Aborting on close stops the agent
   * call when the client hangs up, so a user who navigates away stops costing
   * tokens against a 200k-per-day budget.
   */
  async streamMessage(req: Request, res: Response) {
    const userId = req.user!.id;
    const { sessionId, context: requestContext } = req.body;

    const controller = new AbortController();
    // `res.on('close')`, not `req.on('close')` — the request closes as soon as
    // its body is read, so listening there kills the stream before it begins.
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    // Deliberately outside a try: nothing has been written yet, so a failure
    // here can still be an honest HTTP error handled by the error middleware,
    // rather than a 200 carrying an error frame.
    const frames = await this.turns.stream({
      caller: req.user!,
      sessionId,
      text: messageText(req.body.content ?? req.body.message),
      requestContext,
      signal: controller.signal,
    });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // nginx buffers proxied responses by default, which turns a stream into
      // one lump delivered at the end.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    try {
      await pipeline(frames, res);
    } catch (error) {
      if (controller.signal.aborted) {
        logger.info('Client disconnected mid-stream', { userId, sessionId });
        return;
      }
      logger.error('Failed to stream chat message:', error);
      if (!res.writableEnded) res.end();
    }
  }
}
