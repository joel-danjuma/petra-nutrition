import { Request, Response } from 'express';
import { prisma } from '../database';
import { ChatService } from '../services/chat';
import { AnalyticsService } from '../services/analytics';
import { logger } from '../utils/logger';

export class AnalyticsController {
  private chatService: ChatService;
  private analyticsService: AnalyticsService;

  constructor() {
    this.chatService = new ChatService();
    this.analyticsService = new AnalyticsService();
  }

  async getUserStats(req: Request, res: Response) {
    const userId = req.user!.id;

    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [
        totalRecipes,
        totalMealPlans,
        totalShoppingLists,
        totalPantryItems,
        totalFavorites,
        recentActivity,
      ] = await Promise.all([
        prisma.recipe.count({ where: { createdById: userId } }),
        prisma.mealPlan.count({ where: { userId } }),
        prisma.shoppingList.count({ where: { userId } }),
        prisma.pantryItem.count({ where: { userId } }),
        prisma.userFavorite.count({ where: { userId } }),
        prisma.chatSession.findMany({
          where: { userId, updatedAt: { gte: thirtyDaysAgo } },
          select: { id: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 5,
        }),
      ]);

      res.json({
        success: true,
        data: {
          totalRecipes,
          totalMealPlans,
          totalShoppingLists,
          totalPantryItems,
          totalFavorites,
          recentActivity,
        },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to get user stats:', error);
      throw error;
    }
  }

  async getFeatureUsage(req: Request, res: Response) {
    const userId = req.user!.id;

    try {
      const [
        pantryItemCount,
        mealPlanCount,
        shoppingListCount,
        recipesCreated,
        aiRecipesGenerated,
      ] = await Promise.all([
        prisma.pantryItem.count({ where: { userId } }),
        prisma.mealPlan.count({ where: { userId } }),
        prisma.shoppingList.count({ where: { userId } }),
        prisma.recipe.count({ where: { createdById: userId } }),
        prisma.recipe.count({ where: { createdById: userId, isAIGenerated: true } }),
      ]);

      res.json({
        success: true,
        data: {
          pantryItems: pantryItemCount,
          mealPlans: mealPlanCount,
          shoppingLists: shoppingListCount,
          recipesCreated,
          aiRecipesGenerated,
          humanRecipesCreated: recipesCreated - aiRecipesGenerated,
        },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to get feature usage:', error);
      throw error;
    }
  }

  async getChatAnalytics(req: Request, res: Response) {
    const userId = req.user!.id;

    try {
      const analytics = await this.chatService.getChatAnalytics(userId);

      res.json({
        success: true,
        data: analytics,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to get chat analytics:', error);
      throw error;
    }
  }

  async getPantryAnalytics(req: Request, res: Response) {
    const userId = req.user!.id;

    try {
      const [
        totalItems,
        lowStockItems,
        expiringSoonItems,
        categoryCounts,
        locationCounts,
      ] = await Promise.all([
        prisma.pantryItem.count({ where: { userId } }),
        prisma.pantryItem.count({ where: { userId, isLowStock: true } }),
        prisma.pantryItem.count({
          where: {
            userId,
            expirationDate: {
              lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              gte: new Date(),
            },
          },
        }),
        prisma.pantryItem.groupBy({
          by: ['category'],
          where: { userId },
          _count: { category: true },
        }),
        prisma.pantryItem.groupBy({
          by: ['location'],
          where: { userId },
          _count: { location: true },
        }),
      ]);

      res.json({
        success: true,
        data: {
          totalItems,
          lowStockItems,
          expiringSoonItems,
          byCategory: categoryCounts.map(c => ({
            category: c.category,
            count: c._count.category,
          })),
          byLocation: locationCounts.map(l => ({
            location: l.location,
            count: l._count.location,
          })),
        },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to get pantry analytics:', error);
      throw error;
    }
  }

  async logWaste(req: Request, res: Response) {
    const userId = req.user!.id;

    try {
      await this.analyticsService.logWaste(userId, req.body);

      res.status(201).json({
        success: true,
        data: { message: 'Waste event logged' },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to log waste event:', error);
      throw error;
    }
  }

  async getWasteSummary(req: Request, res: Response) {
    const userId = req.user!.id;

    try {
      const summary = await this.analyticsService.getWasteSummary(userId);

      res.json({
        success: true,
        data: summary,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to get waste summary:', error);
      throw error;
    }
  }

  async logMealCompletion(req: Request, res: Response) {
    const userId = req.user!.id;

    try {
      await this.analyticsService.logMealCompletion(userId, req.body);

      res.status(201).json({
        success: true,
        data: { message: 'Meal completion logged' },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to log meal completion:', error);
      throw error;
    }
  }

  async getTodayNutrition(req: Request, res: Response) {
    const userId = req.user!.id;

    try {
      const nutrition = await this.analyticsService.getTodayNutrition(userId);

      res.json({
        success: true,
        data: nutrition,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to get today nutrition:', error);
      throw error;
    }
  }
}
