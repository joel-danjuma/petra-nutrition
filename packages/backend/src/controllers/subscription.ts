import { Request, Response } from 'express';
import { prisma } from '../database';
import { logger } from '../utils/logger';

export class SubscriptionController {
  async getStatus(req: Request, res: Response) {
    const userId = req.user!.id;

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          subscriptionTier: true,
          email: true,
        },
      });

      const isPremium = user?.subscriptionTier === 'PREMIUM';

      res.json({
        success: true,
        data: {
          tier: user?.subscriptionTier ?? 'FREE',
          isPremium,
          features: {
            pantryManagement: isPremium,
            shoppingLists: isPremium,
            multiDayMealPlans: isPremium,
            advancedAI: isPremium,
            barcodeScanning: isPremium,
            imageRecognition: isPremium,
          },
        },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to get subscription status:', error);
      throw error;
    }
  }

  async upgrade(req: Request, res: Response) {
    const userId = req.user!.id;

    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { subscriptionTier: 'PREMIUM' },
        select: { id: true, subscriptionTier: true, email: true },
      });

      logger.info('User upgraded to premium', { userId });

      res.json({
        success: true,
        data: {
          tier: user.subscriptionTier,
          isPremium: true,
          message: 'Successfully upgraded to Premium',
        },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to upgrade subscription:', error);
      throw error;
    }
  }

  async cancel(req: Request, res: Response) {
    const userId = req.user!.id;

    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { subscriptionTier: 'FREE' },
        select: { id: true, subscriptionTier: true },
      });

      logger.info('User subscription cancelled', { userId });

      res.json({
        success: true,
        data: {
          tier: user.subscriptionTier,
          isPremium: false,
          message: 'Subscription cancelled. You have been moved to the Free tier.',
        },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to cancel subscription:', error);
      throw error;
    }
  }

  async getUsage(req: Request, res: Response) {
    const userId = req.user!.id;

    try {
      const [
        chatSessionCount,
        chatMessageCount,
        recipeCount,
        mealPlanCount,
        shoppingListCount,
        pantryItemCount,
      ] = await Promise.all([
        prisma.chatSession.count({ where: { userId } }),
        prisma.chatMessage.count({ where: { session: { userId } } }),
        prisma.recipe.count({ where: { createdById: userId } }),
        prisma.mealPlan.count({ where: { userId } }),
        prisma.shoppingList.count({ where: { userId } }),
        prisma.pantryItem.count({ where: { userId } }),
      ]);

      res.json({
        success: true,
        data: {
          chatSessions: chatSessionCount,
          chatMessages: chatMessageCount,
          recipesCreated: recipeCount,
          mealPlansCreated: mealPlanCount,
          shoppingListsCreated: shoppingListCount,
          pantryItems: pantryItemCount,
        },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to get usage stats:', error);
      throw error;
    }
  }

  async handleWebhook(req: Request, res: Response) {
    // Placeholder for Stripe webhook — returns 200 to prevent Stripe retries
    logger.info('Webhook received (Stripe not yet integrated)');
    res.json({ received: true });
  }
}
