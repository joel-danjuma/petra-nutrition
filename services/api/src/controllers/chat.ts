import { Request, Response } from 'express';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import type {
  AgentContext,
  ChatRequest,
  ChatResponse as AgentChatResponse,
} from '@petra/agent-contract';

import { ChatService } from '../services/chat';
import { PantryService } from '../services/pantry';
import { agentClient } from '../services/agent-client';
import { NotFoundError, ValidationError } from '../middleware/error';
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
  private pantryService: PantryService;

  constructor() {
    this.chatService = new ChatService();
    this.pantryService = new PantryService();
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
      const sessionData = {
        userId,
        title: title || null,
        isActive: true,
        context: await this.buildUserContext(userId),
      };

      const session = await this.chatService.createSession(sessionData);

      // If there's an initial message, send it to AI
      if (initialMessage) {
        await this.sendMessageToAI(session.id, req.user!, initialMessage);
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

      // Build context for AI
      const aiContext = await this.buildUserContext(userId, requestContext, content);
      
      // Get recent messages for conversation history
      const recentMessages = await this.chatService.getRecentMessages(
        sessionId,
        requestContext?.maxContextMessages || 10
      );

      // Hand the turn to the agent. Model selection and retrieval are its
      // decisions now — it owns the recipe index and the token budget.
      const startedAt = Date.now();
      const aiResponse = await agentClient.chat(
        this.buildAgentRequest(req, recentMessages, aiContext)
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

    const aiContext = await this.buildUserContext(userId, requestContext, content);
    const recentMessages = await this.chatService.getRecentMessages(
      sessionId,
      requestContext?.maxContextMessages || 10
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
      this.buildAgentRequest(req, recentMessages, aiContext),
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

  async generateRecipe(req: Request, res: Response) {
    const userId = req.user!.id;
    const { ingredients, preferences } = req.body;

    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      throw new ValidationError('Ingredients array is required');
    }

    try {
      const aiResponse = await agentClient.generateRecipe({
        ingredients,
        preferences,
        user: {
          id: userId,
          subscriptionTier: req.user!.subscriptionTier === 'PREMIUM' ? 'PREMIUM' : 'FREE',
        },
      });

      logger.info('Recipe generated via chat', {
        userId,
        ingredientCount: ingredients.length,
      });

      res.json({
        success: true,
        data: aiResponse,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to generate recipe:', error);
      throw error;
    }
  }

  async generateMealPlan(req: Request, res: Response) {
    const userId = req.user!.id;
    const { days, preferences } = req.body;

    if (!days || days < 1 || days > 14) {
      throw new ValidationError('Days must be between 1 and 14');
    }

    // Check if user has premium for multi-day plans
    if (days > 1 && req.user!.subscriptionTier !== 'PREMIUM') {
      throw new ValidationError('Premium subscription required for multi-day meal plans');
    }

    try {
      const context = await this.buildUserContext(userId);
      const aiResponse = await agentClient.generateMealPlan({
        days,
        preferences,
        context,
        user: {
          id: userId,
          subscriptionTier: req.user!.subscriptionTier === 'PREMIUM' ? 'PREMIUM' : 'FREE',
        },
      });

      logger.info('Meal plan generated via chat', {
        userId,
        days,
      });

      res.json({
        success: true,
        data: aiResponse,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to generate meal plan:', error);
      throw error;
    }
  }

  async getCookingTips(req: Request, res: Response) {
    const { topic } = req.body;

    if (!topic) {
      throw new ValidationError('Topic is required');
    }

    try {
      const aiResponse = await agentClient.cookingTips({ topic });

      logger.info('Cooking tips requested', {
        userId: req.user!.id,
        topic,
      });

      res.json({
        success: true,
        data: aiResponse,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to get cooking tips:', error);
      throw error;
    }
  }

  async analyzeNutrition(req: Request, res: Response) {
    const { foodItems } = req.body;

    if (!foodItems || !Array.isArray(foodItems) || foodItems.length === 0) {
      throw new ValidationError('Food items array is required');
    }

    try {
      const aiResponse = await agentClient.analyzeNutrition({ foodItems });

      logger.info('Nutrition analysis requested', {
        userId: req.user!.id,
        itemCount: foodItems.length,
      });

      res.json({
        success: true,
        data: aiResponse,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to analyze nutrition:', error);
      throw error;
    }
  }

  /**
   * Send the opening message of a brand-new session.
   *
   * Takes the tier explicitly rather than re-reading it: the caller already has
   * an authenticated request, and the agent needs it to know whether pantry
   * context applies.
   */
  private async sendMessageToAI(
    sessionId: string,
    user: { id: string; subscriptionTier: string },
    message: string
  ) {
    await this.chatService.addMessage(sessionId, {
      role: 'USER',
      content: [{ type: 'text', text: message }],
      timestamp: new Date(),
    });

    const context = await this.buildUserContext(user.id);
    const recentMessages = await this.chatService.getRecentMessages(sessionId, 5);

    const aiResponse = await agentClient.chat({
      messages: recentMessages.map(msg => ({
        role: msg.role.toLowerCase() as ChatRequest['messages'][number]['role'],
        content: messageText(msg.content),
      })),
      user: {
        id: user.id,
        subscriptionTier: user.subscriptionTier === 'PREMIUM' ? 'PREMIUM' : 'FREE',
      },
      context,
    });

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
   * Everything here is a database read the agent is not allowed to make: who
   * the user is, what they keep in their pantry, what they can't eat. The agent
   * gets it as data and gives back prose.
   */
  private buildAgentRequest(
    req: Request,
    recentMessages: { role: string; content: unknown }[],
    context: AgentContext
  ): ChatRequest {
    return {
      messages: recentMessages.map(msg => ({
        role: msg.role.toLowerCase() as ChatRequest['messages'][number]['role'],
        content: messageText(msg.content),
      })),
      user: {
        id: req.user!.id,
        subscriptionTier:
          req.user!.subscriptionTier === 'PREMIUM' ? 'PREMIUM' : 'FREE',
      },
      context,
    };
  }

  /**
   * What the API knows about the user.
   *
   * This used to do two unrelated jobs — load the profile and pantry, and run
   * recipe retrieval. The second half moved to the agent, which owns the recipe
   * index; that division is the service boundary. What remains is purely a
   * database read.
   */
  private async buildUserContext(
    userId: string,
    requestContext?: any,
    _userMessage?: string
  ): Promise<AgentContext> {
    try {
      const user = await this.chatService.getUserProfile(userId);

      // Pantry-aware suggestions are a premium feature.
      let pantryItems: string[] = [];
      let pantryNames: string[] = [];
      if (user?.subscriptionTier === 'PREMIUM') {
        const pantryResult = await this.pantryService.getItems(userId, { limit: 50 });
        pantryItems = pantryResult.items.map(
          item => `${item.name} (${item.quantity} ${item.unit})`
        );
        pantryNames = pantryResult.items.map(item => item.name);
      }

      return {
        userPreferences: user?.profile,
        currentPantryItems: pantryItems,
        pantryNames,
        dietaryRestrictions: user?.profile?.dietaryRestrictions || [],
        healthGoals: user?.profile?.healthGoals || [],
        allergies: user?.profile?.allergies || [],
        ...requestContext,
      };
    } catch (error) {
      logger.warn('Failed to build user context:', error);
      return {
        currentPantryItems: [],
        pantryNames: [],
        dietaryRestrictions: [],
        healthGoals: [],
        allergies: [],
      };
    }
  }
}
