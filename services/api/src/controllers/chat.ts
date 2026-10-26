import { Request, Response } from 'express';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import type {
  ChatRequest,
  ChatResponse as AgentChatResponse,
} from '@petra/agent-contract';

import { ChatService } from '../services/chat';
import { agentClient } from '../services/agent-client';
import {
  buildCallerContext,
  readContextAdditions,
  type CallerContext,
} from '../services/caller-context';
import { NotFoundError } from '../middleware/error';
import { logger } from '../utils/logger';
import { prisma } from '../database';

/**
 * `ChatMessage.content` is a Json column holding either a plain string (older
 * rows) or an array of `{ type: 'text', text }` blocks. Flatten either shape to
 * the string the model and the clients want.
 */
function messageText(content: unknown): string {
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

/** How much history a turn carries when the request does not say. */
const DEFAULT_HISTORY = 10;
const MAX_HISTORY = 50;

/**
 * The history window a request asked for, bounded.
 *
 * Read on its own rather than as part of the request's `context`: it is a
 * request option, not something the agent is told about the user, and the
 * context object it used to ride in is no longer passed through.
 */
function historyWindow(requestContext: unknown): number {
  const raw =
    requestContext && typeof requestContext === 'object'
      ? (requestContext as { maxContextMessages?: unknown }).maxContextMessages
      : undefined;
  const n = typeof raw === 'number' ? Math.floor(raw) : NaN;
  return n >= 1 ? Math.min(n, MAX_HISTORY) : DEFAULT_HISTORY;
}

/**
 * Chat, after the split.
 *
 * This controller kept every stateful job — session ownership, persisting both
 * messages, hydrating the recipe card — and gave up every inference job. What
 * used to be an inline call to Groq plus a retrieval pass is now one call to
 * the agent, which owns the recipe index and retrieves for itself.
 *
 * Note what did *not* change: the request and response shapes. Mobile and web
 * cannot tell that anything moved.
 */
/**
 * Pull the `done` frame out of an SSE transcript.
 *
 * The gateway forwards the agent's stream verbatim, but it still owns the
 * transcript, so it reads the final frame as the bytes go past in order to
 * persist the assistant message. Returns null when the stream ended without
 * one — an aborted or failed turn — in which case nothing is stored, which is
 * the right outcome: a half-generated reply is not a message.
 */
function parseDoneFrame(transcript: string): AgentChatResponse | null {
  const frames = transcript.split('\n\n');

  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i];
    if (!frame.startsWith('event: done')) continue;

    const dataLine = frame.split('\n').find(line => line.startsWith('data: '));
    if (!dataLine) continue;

    try {
      return JSON.parse(dataLine.slice(6)) as AgentChatResponse;
    } catch {
      return null;
    }
  }

  return null;
}

export class ChatController {
  private chatService: ChatService;

  constructor() {
    this.chatService = new ChatService();
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

      // If there's an initial message, send it to AI
      if (initialMessage) {
        await this.sendMessageToAI(session.id, caller, initialMessage);
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
    const userId = req.user!.id;
    const { sessionId, context: requestContext } = req.body;
    // `message` is accepted as an alias for `content`: the mobile client sends
    // that name, and rejecting it was a contract mismatch, not a bad request.
    const content = messageText(req.body.content ?? req.body.message);

    try {
      // Validate session belongs to user
      const session = await this.chatService.getSession(sessionId, userId);
      if (!session) {
        throw new NotFoundError('Chat session');
      }

      // Add user message to session
      await this.chatService.addMessage(sessionId, {
        role: 'USER',
        content: [{ type: 'text', text: content }],
        timestamp: new Date(),
      });

      // The request's own context can only add constraints to the profile's,
      // never replace them — see `buildCallerContext`.
      const caller = await buildCallerContext(
        req.user!,
        readContextAdditions(requestContext)
      );

      // Get recent messages for conversation history
      const recentMessages = await this.chatService.getRecentMessages(
        sessionId,
        historyWindow(requestContext)
      );

      // Hand the turn to the agent. Model selection and retrieval are its
      // decisions now — it owns the recipe index and the token budget.
      const startedAt = Date.now();
      const aiResponse = await agentClient.chat(
        this.buildAgentRequest(recentMessages, caller, sessionId)
      );
      const agentLatencyMs = Date.now() - startedAt;

      // Add AI response to session
      const aiMessage = await this.chatService.addMessage(sessionId, {
        role: 'ASSISTANT',
        content: [{ type: 'text', text: aiResponse.content }],
        timestamp: new Date(),
        metadata: {
          type: aiResponse.type,
          confidence: aiResponse.confidence,
          structuredData: aiResponse.structuredData,
          // Drives the tappable recipe card in the chat stream.
          recipeId: aiResponse.recipeId,
          // A composed dish has no `recipeId` to reopen, so it is stored with
          // the message. Otherwise scrolling back to yesterday's generated
          // recipe shows the prose and nothing to cook from.
          generatedRecipe: aiResponse.generatedRecipe,
          nutrition: aiResponse.nutrition,
          assumptions: aiResponse.assumptions,
          compromises: aiResponse.compromises,
        },
      });

      logger.info('Chat message processed', {
        userId,
        sessionId,
        responseType: aiResponse.type,
        groundedRecipeId: aiResponse.recipeId,
        model: aiResponse.model,
        tokensUsed: aiResponse.tokensUsed,
        // Measured rather than assumed: the extra hop was argued to be
        // negligible against a Groq call, and this is the number that says so.
        agentLatencyMs,
      });

      res.json({
        success: true,
        data: {
          message: aiMessage,
          // Plain text alongside the stored message: the message's `content` is
          // a JSON block array, and every client wants the string.
          content: aiResponse.content,
          // Hydrated so the chat card renders without a second round trip.
          recipe: await this.hydrateRecipeCard(aiResponse.recipeId),
          suggestions: aiResponse.suggestions,
          // Present when the assistant composed a dish rather than finding
          // one. Unlike `recipe`, there is nothing to hydrate: this *is* the
          // recipe, until the user saves it.
          generatedRecipe: aiResponse.generatedRecipe,
          nutrition: aiResponse.nutrition,
          assumptions: aiResponse.assumptions,
          compromises: aiResponse.compromises,
        },
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
   * `for await` loop over chunks does not. It also aborts the agent call when
   * the client hangs up, so a user who navigates away stops costing tokens
   * against a 200k-per-day budget.
   *
   * The stream is also read as it passes, purely so the completed assistant
   * message can be persisted — the API still owns the transcript. Reading a tee
   * of the stream does not delay it.
   */
  async streamMessage(req: Request, res: Response) {
    const userId = req.user!.id;
    const { sessionId, context: requestContext } = req.body;
    const content = messageText(req.body.content ?? req.body.message);

    const session = await this.chatService.getSession(sessionId, userId);
    if (!session) {
      throw new NotFoundError('Chat session');
    }

    await this.chatService.addMessage(sessionId, {
      role: 'USER',
      content: [{ type: 'text', text: content }],
      timestamp: new Date(),
    });

    const caller = await buildCallerContext(
      req.user!,
      readContextAdditions(requestContext)
    );
    const recentMessages = await this.chatService.getRecentMessages(
      sessionId,
      historyWindow(requestContext)
    );

    const controller = new AbortController();
    // `res.on('close')`, not `req.on('close')` — the request closes as soon as
    // its body is read, so listening there kills the stream before it begins.
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    // Deliberately outside a try: nothing has been written yet, so a failure
    // here can still be an honest HTTP error handled by the error middleware,
    // rather than a 200 carrying an error frame.
    const upstream = await agentClient.chatStream(
      this.buildAgentRequest(recentMessages, caller, sessionId),
      controller.signal
    );

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // nginx buffers proxied responses by default, which turns a stream into
      // one lump delivered at the end.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    // Watch the frames go past so the finished reply can be stored, without
    // holding any of them up.
    let transcript = '';
    const observe = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controllerT) {
        transcript += Buffer.from(chunk).toString('utf8');
        controllerT.enqueue(chunk);
      },
    });

    try {
      await pipeline(
        Readable.fromWeb(upstream.body!.pipeThrough(observe) as any),
        res
      );

      const finalResponse = parseDoneFrame(transcript);
      if (finalResponse) {
        await this.chatService.addMessage(sessionId, {
          role: 'ASSISTANT',
          content: [{ type: 'text', text: finalResponse.content }],
          timestamp: new Date(),
          metadata: {
            type: finalResponse.type,
            confidence: finalResponse.confidence,
            recipeId: finalResponse.recipeId,
            // A composed dish has no `recipeId` to reopen, so the payload
            // itself is stored with the message. Without this, scrolling back
            // to yesterday's generated recipe shows the prose and an empty
            // card — the recipe existed only in that response.
            generatedRecipe: finalResponse.generatedRecipe,
            nutrition: finalResponse.nutrition,
            assumptions: finalResponse.assumptions,
            compromises: finalResponse.compromises,
          },
        });
      }

      logger.info('Chat message streamed', {
        userId,
        sessionId,
        persisted: Boolean(finalResponse),
        model: finalResponse?.model,
        tokensUsed: finalResponse?.tokensUsed,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        logger.info('Client disconnected mid-stream', { userId, sessionId });
        return;
      }
      logger.error('Failed to stream chat message:', error);
      if (!res.writableEnded) res.end();
    }
  }

  /**
   * Send the opening message of a brand-new session.
   *
   * Takes the caller context the session was created with rather than reading
   * the profile a second time.
   */
  private async sendMessageToAI(
    sessionId: string,
    caller: CallerContext,
    message: string
  ) {
    await this.chatService.addMessage(sessionId, {
      role: 'USER',
      content: [{ type: 'text', text: message }],
      timestamp: new Date(),
    });

    const recentMessages = await this.chatService.getRecentMessages(sessionId, 5);

    const aiResponse = await agentClient.chat(
      this.buildAgentRequest(recentMessages, caller)
    );

    await this.chatService.addMessage(sessionId, {
      role: 'ASSISTANT',
      content: [{ type: 'text', text: aiResponse.content }],
      timestamp: new Date(),
      metadata: {
        type: aiResponse.type,
        confidence: aiResponse.confidence,
        // Carried so an opening message can render a recipe card too; the
        // non-streaming path already did this and this one silently did not.
        recipeId: aiResponse.recipeId,
      },
    });
  }

  /**
   * Turn a grounded recipe id into the fields the chat card renders. Returns
   * null rather than throwing: a stale or hallucinated id should cost the card,
   * not the whole reply.
   */
  private async hydrateRecipeCard(recipeId?: string) {
    if (!recipeId) return null;
    try {
      const recipe = await prisma.recipe.findUnique({
        where: { id: recipeId },
        select: {
          id: true,
          title: true,
          imageUrl: true,
          totalTime: true,
          servings: true,
          dietaryTags: true,
          nutrition: { select: { calories: true, protein: true } },
          _count: { select: { ingredients: true } },
        },
      });
      if (!recipe) {
        logger.warn('Grounded recipe id not found', { recipeId });
        return null;
      }
      return recipe;
    } catch (err) {
      logger.warn('Failed to hydrate recipe card', err);
      return null;
    }
  }

  /**
   * Assemble the agent request from persisted state.
   *
   * Who the user is and what they can't eat come from `buildCallerContext`,
   * the one producer of both — database reads the agent is not allowed to
   * make. The agent gets them as data and gives back prose.
   */
  private buildAgentRequest(
    recentMessages: { role: string; content: unknown }[],
    { user, context }: CallerContext,
    sessionId?: string
  ): ChatRequest {
    return {
      messages: recentMessages.map(msg => ({
        role: msg.role.toLowerCase() as ChatRequest['messages'][number]['role'],
        content: messageText(msg.content),
      })),
      user,
      context,
      // The chat session, so the agent's ephemeral graph state lines up with
      // the conversation the user is actually having. Deliberately the session
      // id and not the user id: one user can have several conversations, and
      // they should not share working state.
      //
      // This does not move ownership of anything. The transcript is still ours;
      // what the agent keeps under this key is a TTL'd copy of one turn's
      // working channels, holding nothing the request did not already carry.
      ...(sessionId ? { options: { threadId: sessionId } } : {}),
    };
  }
}
