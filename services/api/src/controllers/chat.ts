import { Request, Response } from 'express';
import { ChatService } from '../services/chat';
import { AIChatService } from '../services/ai-chat';
import { PantryService } from '../services/pantry';
import { NotFoundError, ValidationError } from '../middleware/error';
import { logger } from '../utils/logger';

export class ChatController {
  private chatService: ChatService;
  private aiChatService: AIChatService;
  private pantryService: PantryService;

  constructor() {
    this.chatService = new ChatService();
    this.aiChatService = new AIChatService();
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
        await this.sendMessageToAI(session.id, userId, initialMessage);
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
    const { sessionId, content, context: requestContext } = req.body;

    try {
      // Validate session belongs to user
      const session = await this.chatService.getSession(sessionId, userId);
      if (!session) {
        throw new NotFoundError('Chat session');
      }

      // Add user message to session
      await this.chatService.addMessage(sessionId, {
        role: 'user',
        content,
        timestamp: new Date(),
      });

      // Build context for AI
      const aiContext = await this.buildUserContext(userId, requestContext);
      
      // Get recent messages for conversation history
      const recentMessages = await this.chatService.getRecentMessages(
        sessionId,
        requestContext?.maxContextMessages || 10
      );

      // Send to AI
      const aiResponse = await this.aiChatService.sendMessage(
        recentMessages.map(msg => ({
          role: msg.role as any,
          content: Array.isArray(msg.content) ? msg.content.map(c => c.text).join('\n') : msg.content,
        })),
        aiContext,
        this.shouldUseAdvancedModel(content)
      );

      // Add AI response to session
      const aiMessage = await this.chatService.addMessage(sessionId, {
        role: 'assistant',
        content: [{ type: 'text', text: aiResponse.content }],
        timestamp: new Date(),
        metadata: {
          type: aiResponse.type,
          confidence: aiResponse.confidence,
          structuredData: aiResponse.structuredData,
        },
      });

      logger.info('Chat message processed', {
        userId,
        sessionId,
        responseType: aiResponse.type,
      });

      res.json({
        success: true,
        data: {
          message: aiMessage,
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

  async streamMessage(req: Request, res: Response) {
    const userId = req.user!.id;
    const { sessionId, content, context: requestContext } = req.body;

    try {
      // Validate session belongs to user
      const session = await this.chatService.getSession(sessionId, userId);
      if (!session) {
        throw new NotFoundError('Chat session');
      }

      // Set up Server-Sent Events
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      });

      // Add user message to session
      await this.chatService.addMessage(sessionId, {
        role: 'user',
        content,
        timestamp: new Date(),
      });

      // Build context for AI
      const aiContext = await this.buildUserContext(userId, requestContext);
      
      // Get recent messages for conversation history
      const recentMessages = await this.chatService.getRecentMessages(
        sessionId,
        requestContext?.maxContextMessages || 10
      );

      let fullResponse = '';

      // Stream AI response
      await this.aiChatService.streamMessage(
        recentMessages.map(msg => ({
          role: msg.role as any,
          content: Array.isArray(msg.content) ? msg.content.map(c => c.text).join('\n') : msg.content,
        })),
        aiContext,
        (chunk: string) => {
          fullResponse += chunk;
          res.write(`data: ${JSON.stringify({ content: chunk, isComplete: false })}\n\n`);
        },
        this.shouldUseAdvancedModel(content)
      );

      // Add complete AI response to session
      await this.chatService.addMessage(sessionId, {
        role: 'assistant',
        content: [{ type: 'text', text: fullResponse }],
        timestamp: new Date(),
      });

      // Send completion signal
      res.write(`data: ${JSON.stringify({ content: '', isComplete: true })}\n\n`);
      res.end();

      logger.info('Chat message streamed', {
        userId,
        sessionId,
        responseLength: fullResponse.length,
      });
    } catch (error) {
      logger.error('Failed to stream chat message:', error);
      res.write(`data: ${JSON.stringify({ error: 'Failed to process message' })}\n\n`);
      res.end();
    }
  }

  async generateRecipe(req: Request, res: Response) {
    const userId = req.user!.id;
    const { ingredients, preferences } = req.body;

    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      throw new ValidationError('Ingredients array is required');
    }

    try {
      const aiResponse = await this.aiChatService.generateRecipe(ingredients, preferences);

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
      const aiResponse = await this.aiChatService.generateMealPlan(days, preferences, context);

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
      const aiResponse = await this.aiChatService.getCookingTips(topic);

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
      const aiResponse = await this.aiChatService.analyzeNutrition(foodItems);

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

  private async sendMessageToAI(sessionId: string, userId: string, message: string) {
    // Helper method to send a message and get AI response
    await this.chatService.addMessage(sessionId, {
      role: 'user',
      content: [{ type: 'text', text: message }],
      timestamp: new Date(),
    });

    const context = await this.buildUserContext(userId);
    const recentMessages = await this.chatService.getRecentMessages(sessionId, 5);

    const aiResponse = await this.aiChatService.sendMessage(
      recentMessages.map(msg => ({
        role: msg.role as any,
        content: Array.isArray(msg.content) ? msg.content.map(c => c.text).join('\n') : msg.content,
      })),
      context
    );

    await this.chatService.addMessage(sessionId, {
      role: 'assistant',
      content: [{ type: 'text', text: aiResponse.content }],
      timestamp: new Date(),
      metadata: {
        type: aiResponse.type,
        confidence: aiResponse.confidence,
      },
    });
  }

  private async buildUserContext(userId: string, requestContext?: any) {
    try {
      // Get user profile and preferences
      const user = await this.chatService.getUserProfile(userId);
      
      // Get current pantry items if user has premium
      let pantryItems: string[] = [];
      if (user?.subscriptionTier === 'PREMIUM') {
        const pantryResult = await this.pantryService.getItems(userId, { limit: 50 });
        pantryItems = pantryResult.items.map(item => `${item.name} (${item.quantity} ${item.unit})`);
      }

      return {
        userPreferences: user?.profile,
        currentPantryItems: pantryItems,
        dietaryRestrictions: user?.profile?.dietaryRestrictions || [],
        healthGoals: user?.profile?.healthGoals || [],
        ...requestContext,
      };
    } catch (error) {
      logger.warn('Failed to build user context:', error);
      return {};
    }
  }

  private shouldUseAdvancedModel(content: string): boolean {
    const advancedKeywords = [
      'meal plan', 'nutrition', 'complex recipe', 'detailed analysis',
      'multiple days', 'comprehensive', 'elaborate'
    ];

    return advancedKeywords.some(keyword => 
      content.toLowerCase().includes(keyword)
    );
  }
}
