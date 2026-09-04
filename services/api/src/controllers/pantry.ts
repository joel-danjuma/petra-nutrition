import { Request, Response } from 'express';
import { PantryService } from '../services/pantry';
import fs from 'fs/promises';

import { agentClient } from '../services/agent-client';
import { BarcodeService } from '../services/barcode';
import { NotFoundError, ValidationError } from '../middleware/error';
import { logger } from '../utils/logger';

export class PantryController {
  private pantryService: PantryService;
  private barcodeService: BarcodeService;

  constructor() {
    this.pantryService = new PantryService();
    this.barcodeService = new BarcodeService();
  }

  async getItems(req: Request, res: Response) {
    const userId = req.user!.id;
    const {
      query,
      category,
      location,
      isExpiringSoon,
      isLowStock,
      sortBy = 'name',
      sortOrder = 'asc',
      page = 1,
      limit = 50,
    } = req.query;

    try {
      const filters = {
        query: query as string,
        category: category ? (category as string).split(',') : undefined,
        location: location ? (location as string).split(',') : undefined,
        isExpiringSoon: isExpiringSoon === 'true',
        isLowStock: isLowStock === 'true',
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        page: parseInt(page as string),
        limit: parseInt(limit as string),
      };

      const result = await this.pantryService.getItems(userId, filters);

      res.json({
        success: true,
        data: result,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to get pantry items:', error);
      throw error;
    }
  }

  async getStats(req: Request, res: Response) {
    const userId = req.user!.id;

    try {
      const stats = await this.pantryService.getStats(userId);

      res.json({
        success: true,
        data: stats,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to get pantry stats:', error);
      throw error;
    }
  }

  async getById(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      const item = await this.pantryService.getById(id, userId);
      
      if (!item) {
        throw new NotFoundError('Pantry item');
      }

      res.json({
        success: true,
        data: item,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to get pantry item:', error);
      throw error;
    }
  }

  async create(req: Request, res: Response) {
    const userId = req.user!.id;
    const itemData = {
      ...req.body,
      userId,
    };

    try {
      const item = await this.pantryService.create(itemData);

      logger.info('Pantry item created', {
        userId,
        itemId: item.id,
        itemName: item.name,
      });

      res.status(201).json({
        success: true,
        data: item,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to create pantry item:', error);
      throw error;
    }
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;
    const updates = req.body;

    try {
      const item = await this.pantryService.update(id, userId, updates);

      if (!item) {
        throw new NotFoundError('Pantry item');
      }

      logger.info('Pantry item updated', {
        userId,
        itemId: item.id,
        itemName: item.name,
      });

      res.json({
        success: true,
        data: item,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to update pantry item:', error);
      throw error;
    }
  }

  async delete(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.user!.id;
    const reason = req.query.reason as 'used' | 'wasted' | undefined;

    try {
      const deleted = await this.pantryService.delete(id, userId, reason);

      if (!deleted) {
        throw new NotFoundError('Pantry item');
      }

      logger.info('Pantry item deleted', {
        userId,
        itemId: id,
      });

      res.json({
        success: true,
        data: {
          message: 'Pantry item deleted successfully',
        },
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to delete pantry item:', error);
      throw error;
    }
  }

  async bulkUpdate(req: Request, res: Response) {
    const userId = req.user!.id;
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      throw new ValidationError('Items array is required and cannot be empty');
    }

    if (items.length > 50) {
      throw new ValidationError('Cannot update more than 50 items at once');
    }

    try {
      const updatedItems = await this.pantryService.bulkUpdate(userId, items);

      logger.info('Bulk pantry update completed', {
        userId,
        itemCount: updatedItems.length,
      });

      res.json({
        success: true,
        data: updatedItems,
        metadata: {
          timestamp: new Date().toISOString(),
          updatedCount: updatedItems.length,
        },
      });
    } catch (error) {
      logger.error('Failed to bulk update pantry items:', error);
      throw error;
    }
  }

  async scanBarcode(req: Request, res: Response) {
    const { barcode } = req.body;

    if (!barcode) {
      throw new ValidationError('Barcode is required');
    }

    try {
      const result = await this.barcodeService.lookupBarcode(barcode);

      logger.info('Barcode scanned', {
        userId: req.user!.id,
        barcode,
        found: !!result,
      });

      res.json({
        success: true,
        data: result,
        metadata: {
          timestamp: new Date().toISOString(),
          barcode,
        },
      });
    } catch (error) {
      logger.error('Failed to scan barcode:', error);
      throw error;
    }
  }

  async recognizeImage(req: Request, res: Response) {
    const { imageBase64, context = 'pantry_item' } = req.body;

    if (!imageBase64) {
      throw new ValidationError('Image data is required');
    }

    try {
      const result = await agentClient.recognizeImage({ image: imageBase64, context });

      logger.info('Image recognition completed', {
        userId: req.user!.id,
        context,
        confidence: result.confidence,
      });

      res.json({
        success: true,
        data: result,
        metadata: {
          timestamp: new Date().toISOString(),
          context,
        },
      });
    } catch (error) {
      logger.error('Failed to recognize image:', error);
      throw error;
    }
  }

  async uploadAndRecognize(req: Request, res: Response) {
    if (!req.file) {
      throw new ValidationError('Image file is required');
    }

    const { context = 'pantry_item' } = req.body;

    try {
      // Multer, the upload directory and its cleanup stay here: file handling
      // is the gateway's job. Only the image bytes cross to the agent, which
      // does the resizing and the vision call.
      const image = await fs.readFile(req.file.path, { encoding: 'base64' });
      const result = await agentClient.recognizeImage({ image, context });

      try {
        await fs.unlink(req.file.path);
      } catch (cleanupError) {
        logger.warn('Failed to clean up uploaded file:', cleanupError);
      }

      logger.info('Image upload and recognition completed', {
        userId: req.user!.id,
        fileName: req.file.originalname,
        context,
        confidence: result.confidence,
      });

      res.json({
        success: true,
        data: result,
        metadata: {
          timestamp: new Date().toISOString(),
          fileName: req.file.originalname,
          context,
        },
      });
    } catch (error) {
      logger.error('Failed to process uploaded image:', error);
      throw error;
    }
  }

  async exportData(req: Request, res: Response) {
    const userId = req.user!.id;
    const { format = 'json' } = req.query;

    try {
      const data = await this.pantryService.exportUserData(userId, format as string);

      logger.info('Pantry data exported', {
        userId,
        format,
      });

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=pantry-export.csv');
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=pantry-export.json');
      }

      res.send(data);
    } catch (error) {
      logger.error('Failed to export pantry data:', error);
      throw error;
    }
  }
}
