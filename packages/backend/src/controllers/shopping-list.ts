import { Request, Response } from 'express';
import { ShoppingListService } from '../services/shopping-list';
import { NotFoundError, ValidationError } from '../middleware/error';
import { logger } from '../utils/logger';

export class ShoppingListController {
  private shoppingListService: ShoppingListService;

  constructor() {
    this.shoppingListService = new ShoppingListService();
  }

  async getShoppingLists(req: Request, res: Response) {
    const userId = req.user!.id;

    try {
      const result = await this.shoppingListService.getShoppingLists(userId, req.query);

      res.json({
        success: true,
        data: result,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to get shopping lists:', error);
      throw error;
    }
  }

  async getById(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      const list = await this.shoppingListService.getById(id, userId);

      if (!list) {
        throw new NotFoundError('Shopping list');
      }

      res.json({
        success: true,
        data: list,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to get shopping list:', error);
      throw error;
    }
  }

  async create(req: Request, res: Response) {
    const userId = req.user!.id;

    try {
      const list = await this.shoppingListService.create({ ...req.body, userId });

      logger.info('Shopping list created', { userId, listId: list.id });

      res.status(201).json({
        success: true,
        data: list,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to create shopping list:', error);
      throw error;
    }
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      const list = await this.shoppingListService.update(id, userId, req.body);

      if (!list) {
        throw new NotFoundError('Shopping list');
      }

      res.json({
        success: true,
        data: list,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to update shopping list:', error);
      throw error;
    }
  }

  async delete(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      const deleted = await this.shoppingListService.delete(id, userId);

      if (!deleted) {
        throw new NotFoundError('Shopping list');
      }

      logger.info('Shopping list deleted', { userId, listId: id });

      res.json({
        success: true,
        data: { message: 'Shopping list deleted successfully' },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to delete shopping list:', error);
      throw error;
    }
  }

  async generateFromMealPlan(req: Request, res: Response) {
    const userId = req.user!.id;
    const { mealPlanId, name } = req.body;

    if (!mealPlanId) {
      throw new ValidationError('mealPlanId is required');
    }

    try {
      const list = await this.shoppingListService.generateFromMealPlan(mealPlanId, userId, name);

      if (!list) {
        throw new NotFoundError('Meal plan');
      }

      logger.info('Shopping list generated from meal plan', { userId, mealPlanId, listId: list.id });

      res.status(201).json({
        success: true,
        data: list,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to generate shopping list from meal plan:', error);
      throw error;
    }
  }

  async updateItems(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;
    const { items } = req.body;

    if (!Array.isArray(items)) {
      throw new ValidationError('items must be an array');
    }

    try {
      const list = await this.shoppingListService.updateItems(id, userId, items);

      if (!list) {
        throw new NotFoundError('Shopping list');
      }

      res.json({
        success: true,
        data: list,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to update shopping list items:', error);
      throw error;
    }
  }

  async markComplete(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      const list = await this.shoppingListService.markComplete(id, userId);

      if (!list) {
        throw new NotFoundError('Shopping list');
      }

      logger.info('Shopping list marked complete', { userId, listId: id });

      res.json({
        success: true,
        data: list,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to mark shopping list complete:', error);
      throw error;
    }
  }

  async share(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      const list = await this.shoppingListService.getById(id, userId);

      if (!list) {
        throw new NotFoundError('Shopping list');
      }

      // Generate a shareable link (using list ID as token for MVP)
      const shareToken = Buffer.from(`${id}:${userId}`).toString('base64url');
      const shareUrl = `/api/shopping-lists/shared/${shareToken}`;

      res.json({
        success: true,
        data: { shareUrl, shareToken },
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Failed to share shopping list:', error);
      throw error;
    }
  }

  async export(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;
    const { format = 'json' } = req.query;

    try {
      const data = await this.shoppingListService.exportList(id, userId, format as string);

      if (!data) {
        throw new NotFoundError('Shopping list');
      }

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=shopping-list-${id}.csv`);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=shopping-list-${id}.json`);
      }

      res.send(data);
    } catch (error) {
      logger.error('Failed to export shopping list:', error);
      throw error;
    }
  }
}
