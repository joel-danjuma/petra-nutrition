import { Request, Response } from 'express';
import path from 'path';
import { UserService } from '../services/user';
import { NotFoundError, ValidationError } from '../middleware/error';
import { logger } from '../utils/logger';
import { prisma } from '../database';

export class UserController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  async getProfile(req: Request, res: Response) {
    const userId = req.user!.id;

    try {
      const user = await this.userService.findById(userId);

      if (!user) {
        throw new NotFoundError('User');
      }

      const { passwordHash, passwordResetToken, passwordResetExpires, emailVerificationToken, ...safeUser } = user as any;

      res.json({
        success: true,
        data: safeUser,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to get user profile:', error);
      throw error;
    }
  }

  async updateProfile(req: Request, res: Response) {
    const userId = req.user!.id;
    const { firstName, lastName, profile } = req.body;

    try {
      const updates: any = {};
      if (firstName !== undefined) updates.firstName = firstName;
      if (lastName !== undefined) updates.lastName = lastName;

      if (profile) {
        updates.profile = {
          upsert: {
            create: { ...profile },
            update: { ...profile },
          },
        };
      }

      const user = await this.userService.update(userId, updates);

      const { passwordHash, passwordResetToken, passwordResetExpires, emailVerificationToken, ...safeUser } = user as any;

      logger.info('User profile updated', { userId });

      res.json({
        success: true,
        data: safeUser,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to update user profile:', error);
      throw error;
    }
  }

  async uploadAvatar(req: Request, res: Response) {
    const userId = req.user!.id;

    if (!req.file) {
      throw new ValidationError('Avatar image file is required');
    }

    try {
      const avatarUrl = `/uploads/${path.basename(req.file.path)}`;

      const user = await this.userService.update(userId, { avatarUrl });

      logger.info('User avatar uploaded', { userId, avatarUrl });

      res.json({
        success: true,
        data: { avatarUrl: (user as any).avatarUrl },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to upload avatar:', error);
      throw error;
    }
  }

  async deleteAccount(req: Request, res: Response) {
    const userId = req.user!.id;

    try {
      await this.userService.delete(userId);

      logger.info('User account deleted', { userId });

      res.json({
        success: true,
        data: { message: 'Account deleted successfully' },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to delete user account:', error);
      throw error;
    }
  }

  async completeOnboarding(req: Request, res: Response) {
    const userId = req.user!.id;
    const { dietaryRestrictions, allergies, householdSize, cookingSkill } = req.body;

    try {
      const user = await this.userService.completeOnboarding(userId, {
        dietaryRestrictions,
        allergies,
        householdSize,
        cookingSkill,
      });

      const { passwordHash, passwordResetToken, passwordResetExpires, emailVerificationToken, ...safeUser } = user as any;

      logger.info('User completed onboarding', { userId });

      res.json({
        success: true,
        data: safeUser,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to complete onboarding:', error);
      throw error;
    }
  }

  async getStats(req: Request, res: Response) {
    const userId = req.user!.id;

    try {
      const [
        recipeCount,
        pantryItemCount,
        mealPlanCount,
        shoppingListCount,
        chatSessionCount,
        favoriteCount,
      ] = await Promise.all([
        prisma.recipe.count({ where: { createdById: userId } }),
        prisma.pantryItem.count({ where: { userId } }),
        prisma.mealPlan.count({ where: { userId } }),
        prisma.shoppingList.count({ where: { userId } }),
        prisma.chatSession.count({ where: { userId } }),
        prisma.userFavorite.count({ where: { userId } }),
      ]);

      res.json({
        success: true,
        data: {
          recipeCount,
          pantryItemCount,
          mealPlanCount,
          shoppingListCount,
          chatSessionCount,
          favoriteCount,
        },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to get user stats:', error);
      throw error;
    }
  }
}
