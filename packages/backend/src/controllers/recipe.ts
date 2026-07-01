import { Request, Response } from 'express';
import { RecipeService } from '../services/recipe';
import { AIChatService } from '../services/ai-chat';
import { NotFoundError, ValidationError } from '../middleware/error';
import { logger } from '../utils/logger';

export class RecipeController {
  private recipeService: RecipeService;
  private aiChatService: AIChatService;

  constructor() {
    this.recipeService = new RecipeService();
    this.aiChatService = new AIChatService();
  }

  async searchRecipes(req: Request, res: Response) {
    const userId = req.user?.id;
    const {
      q: query,
      cuisine,
      difficulty,
      dietaryTags,
      maxPrepTime,
      maxCookTime,
      isAIGenerated,
      sortBy,
      sortOrder,
      page,
      limit,
    } = req.query;

    try {
      const result = await this.recipeService.search(
        {
          query: query as string,
          cuisine: cuisine as string,
          difficulty: difficulty as any,
          dietaryTags: dietaryTags ? (dietaryTags as string).split(',') : undefined,
          maxPrepTime: maxPrepTime ? parseInt(maxPrepTime as string) : undefined,
          maxCookTime: maxCookTime ? parseInt(maxCookTime as string) : undefined,
          isAIGenerated: isAIGenerated !== undefined ? isAIGenerated === 'true' : undefined,
          sortBy: sortBy as string,
          sortOrder: sortOrder as 'asc' | 'desc',
          page: page ? parseInt(page as string) : 1,
          limit: limit ? parseInt(limit as string) : 20,
        },
        userId
      );

      res.json({
        success: true,
        data: result,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to search recipes:', error);
      throw error;
    }
  }

  async getById(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user?.id;

    try {
      const recipe = await this.recipeService.getById(id, userId);

      if (!recipe) {
        throw new NotFoundError('Recipe');
      }

      res.json({
        success: true,
        data: recipe,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to get recipe:', error);
      throw error;
    }
  }

  async create(req: Request, res: Response) {
    const userId = req.user!.id;
    const recipeData = { ...req.body, createdById: userId };

    try {
      const recipe = await this.recipeService.create(recipeData);

      logger.info('Recipe created', { userId, recipeId: recipe.id });

      res.status(201).json({
        success: true,
        data: recipe,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to create recipe:', error);
      throw error;
    }
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      const recipe = await this.recipeService.update(id, userId, req.body);

      if (!recipe) {
        throw new NotFoundError('Recipe');
      }

      logger.info('Recipe updated', { userId, recipeId: id });

      res.json({
        success: true,
        data: recipe,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to update recipe:', error);
      throw error;
    }
  }

  async delete(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      const deleted = await this.recipeService.delete(id, userId);

      if (!deleted) {
        throw new NotFoundError('Recipe');
      }

      logger.info('Recipe deleted', { userId, recipeId: id });

      res.json({
        success: true,
        data: { message: 'Recipe deleted successfully' },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to delete recipe:', error);
      throw error;
    }
  }

  async generateRecipe(req: Request, res: Response) {
    const userId = req.user!.id;
    const { prompt, preferences } = req.body;

    if (!prompt) {
      throw new ValidationError('Recipe prompt is required');
    }

    try {
      const messages = [
        {
          role: 'user' as const,
          content: `Generate a detailed recipe for: ${prompt}. Include ingredients with amounts, step-by-step instructions, prep time, cook time, servings, difficulty level, and nutrition information. Format your response as a JSON object.`,
        },
      ];

      const context = preferences
        ? {
            dietaryRestrictions: preferences.dietaryRestrictions,
            healthGoals: preferences.healthGoals,
          }
        : undefined;

      const aiResponse = await this.aiChatService.sendMessage(messages, context, true);

      logger.info('Recipe generated via AI', { userId });

      res.json({
        success: true,
        data: {
          content: aiResponse.content,
          structuredData: aiResponse.structuredData,
          type: aiResponse.type,
        },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to generate recipe:', error);
      throw error;
    }
  }

  async addToFavorites(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      const recipe = await this.recipeService.getById(id);
      if (!recipe) throw new NotFoundError('Recipe');

      await this.recipeService.addFavorite(id, userId);

      logger.info('Recipe added to favorites', { userId, recipeId: id });

      res.json({
        success: true,
        data: { message: 'Recipe added to favorites' },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to add recipe to favorites:', error);
      throw error;
    }
  }

  async removeFromFavorites(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      await this.recipeService.removeFavorite(id, userId);

      logger.info('Recipe removed from favorites', { userId, recipeId: id });

      res.json({
        success: true,
        data: { message: 'Recipe removed from favorites' },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to remove recipe from favorites:', error);
      throw error;
    }
  }

  async getFavorites(req: Request, res: Response) {
    const userId = req.user!.id;
    const { page, limit } = req.query;

    try {
      const result = await this.recipeService.getFavorites(
        userId,
        page ? parseInt(page as string) : 1,
        limit ? parseInt(limit as string) : 20
      );

      res.json({
        success: true,
        data: result,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to get favorite recipes:', error);
      throw error;
    }
  }

  async rateRecipe(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;
    const { rating, review } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      throw new ValidationError('Rating must be between 1 and 5');
    }

    try {
      const result = await this.recipeService.rateRecipe(id, userId, rating, review);

      if (!result) {
        throw new NotFoundError('Recipe');
      }

      logger.info('Recipe rated', { userId, recipeId: id, rating });

      res.json({
        success: true,
        data: { message: 'Recipe rated successfully' },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to rate recipe:', error);
      throw error;
    }
  }

  async getMyRecipes(req: Request, res: Response) {
    const userId = req.user!.id;
    const { page, limit } = req.query;

    try {
      const result = await this.recipeService.getMyRecipes(
        userId,
        page ? parseInt(page as string) : 1,
        limit ? parseInt(limit as string) : 20
      );

      res.json({
        success: true,
        data: result,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to get user recipes:', error);
      throw error;
    }
  }
}
