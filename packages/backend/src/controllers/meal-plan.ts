import { Request, Response } from 'express';
import { MealPlanService } from '../services/meal-plan';
import { AIChatService } from '../services/ai-chat';
import { NotFoundError, ValidationError } from '../middleware/error';
import { logger } from '../utils/logger';

export class MealPlanController {
  private mealPlanService: MealPlanService;
  private aiChatService: AIChatService;

  constructor() {
    this.mealPlanService = new MealPlanService();
    this.aiChatService = new AIChatService();
  }

  async getMealPlans(req: Request, res: Response) {
    const userId = req.user!.id;

    try {
      const result = await this.mealPlanService.getMealPlans(userId, req.query);

      res.json({
        success: true,
        data: result,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to get meal plans:', error);
      throw error;
    }
  }

  async getById(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      const mealPlan = await this.mealPlanService.getById(id, userId);

      if (!mealPlan) {
        throw new NotFoundError('Meal plan');
      }

      res.json({
        success: true,
        data: mealPlan,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to get meal plan:', error);
      throw error;
    }
  }

  async create(req: Request, res: Response) {
    const userId = req.user!.id;

    try {
      const mealPlan = await this.mealPlanService.create({ ...req.body, userId });

      logger.info('Meal plan created', { userId, mealPlanId: mealPlan.id });

      res.status(201).json({
        success: true,
        data: mealPlan,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to create meal plan:', error);
      throw error;
    }
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      const mealPlan = await this.mealPlanService.update(id, userId, req.body);

      if (!mealPlan) {
        throw new NotFoundError('Meal plan');
      }

      logger.info('Meal plan updated', { userId, mealPlanId: id });

      res.json({
        success: true,
        data: mealPlan,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to update meal plan:', error);
      throw error;
    }
  }

  async delete(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      const deleted = await this.mealPlanService.delete(id, userId);

      if (!deleted) {
        throw new NotFoundError('Meal plan');
      }

      logger.info('Meal plan deleted', { userId, mealPlanId: id });

      res.json({
        success: true,
        data: { message: 'Meal plan deleted successfully' },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to delete meal plan:', error);
      throw error;
    }
  }

  async generateMealPlan(req: Request, res: Response) {
    const userId = req.user!.id;
    const { days = 1, preferences, pantryItems, goals } = req.body;

    const isPremium = req.user!.subscriptionTier === 'PREMIUM';
    if (days > 1 && !isPremium) {
      throw new ValidationError('Multi-day meal plan generation requires a Premium subscription');
    }

    try {
      const messages = [
        {
          role: 'user' as const,
          content: `Generate a ${days}-day meal plan${preferences ? ` with these preferences: ${JSON.stringify(preferences)}` : ''}${pantryItems?.length ? `. Use these pantry items when possible: ${pantryItems.join(', ')}` : ''}${goals ? `. Health goals: ${goals}` : ''}. Include breakfast, lunch, dinner, and snacks for each day. Format as structured JSON.`,
        },
      ];

      const aiResponse = await this.aiChatService.sendMessage(messages, {
        dietaryRestrictions: preferences?.dietaryRestrictions,
        healthGoals: preferences?.healthGoals,
        currentPantryItems: pantryItems,
      }, days > 3);

      logger.info('Meal plan generated via AI', { userId, days });

      res.json({
        success: true,
        data: {
          content: aiResponse.content,
          structuredData: aiResponse.structuredData,
          days,
        },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to generate meal plan:', error);
      throw error;
    }
  }

  async quickSuggestion(req: Request, res: Response) {
    const userId = req.user!.id;
    const { mealType, pantryItems, preferences } = req.body;

    try {
      const messages = [
        {
          role: 'user' as const,
          content: `Suggest a quick ${mealType || 'meal'} recipe${pantryItems?.length ? ` using: ${pantryItems.join(', ')}` : ''}${preferences ? ` with preferences: ${JSON.stringify(preferences)}` : ''}. Keep it simple and practical.`,
        },
      ];

      const aiResponse = await this.aiChatService.sendMessage(messages, {
        dietaryRestrictions: preferences?.dietaryRestrictions,
        currentPantryItems: pantryItems,
      });

      res.json({
        success: true,
        data: {
          content: aiResponse.content,
          suggestions: aiResponse.suggestions,
        },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to get quick meal suggestion:', error);
      throw error;
    }
  }

  async duplicate(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      const mealPlan = await this.mealPlanService.duplicate(id, userId);

      if (!mealPlan) {
        throw new NotFoundError('Meal plan');
      }

      logger.info('Meal plan duplicated', { userId, originalId: id, newId: mealPlan.id });

      res.status(201).json({
        success: true,
        data: mealPlan,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to duplicate meal plan:', error);
      throw error;
    }
  }

  async saveAsTemplate(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      const mealPlan = await this.mealPlanService.saveAsTemplate(id, userId);

      if (!mealPlan) {
        throw new NotFoundError('Meal plan');
      }

      logger.info('Meal plan saved as template', { userId, mealPlanId: id });

      res.json({
        success: true,
        data: mealPlan,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to save meal plan as template:', error);
      throw error;
    }
  }

  async getNutritionSummary(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      const summary = await this.mealPlanService.getNutritionSummary(id, userId);

      if (!summary) {
        throw new NotFoundError('Meal plan');
      }

      res.json({
        success: true,
        data: summary,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to get nutrition summary:', error);
      throw error;
    }
  }
}
