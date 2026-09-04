import { prisma } from '../database';
import { cache } from '../config/redis';
import { logger } from '../utils/logger';
import { AnalyticsService } from './analytics';

const analyticsService = new AnalyticsService();

export interface PantryFilters {
  query?: string;
  category?: string[];
  location?: string[];
  isExpiringSoon?: boolean;
  isLowStock?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

/**
 * Coerce the enum-valued fields to the canonical UPPERCASE form Prisma expects.
 *
 * The API accepts either casing — the mobile app sends lowercase, the barcode
 * lookup in `services/barcode.ts` returns lowercase, and seeds use uppercase.
 * Normalising here, at the one boundary that talks to Prisma, is the same shape
 * `services/analytics.ts` already uses.
 */
function coercePantryEnums<T extends Record<string, any>>(data: T): T {
  const out: Record<string, any> = { ...data };
  for (const field of ['category', 'location'] as const) {
    if (typeof out[field] === 'string') out[field] = out[field].toUpperCase();
  }
  return out as T;
}

/** Same coercion for a filter value that may be a single string or a list. */
function coerceEnumFilter(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const list = Array.isArray(value) ? value : [value];
  const out = list.filter(v => typeof v === 'string').map(v => (v as string).toUpperCase());
  return out.length ? out : undefined;
}

export class PantryService {
  async getItems(userId: string, filters: PantryFilters) {
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
    } = filters;

    const offset = (page - 1) * limit;

    // Build where clause
    const where: any = { userId };

    if (query) {
      where.name = { contains: query, mode: 'insensitive' };
    }

    const categoryFilter = coerceEnumFilter(category);
    if (categoryFilter) {
      where.category = { in: categoryFilter };
    }

    const locationFilter = coerceEnumFilter(location);
    if (locationFilter) {
      where.location = { in: locationFilter };
    }

    if (isLowStock) {
      where.isLowStock = true;
    }

    if (isExpiringSoon) {
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      
      where.expirationDate = {
        lte: sevenDaysFromNow,
        gte: new Date(),
      };
    }

    // Build order by clause
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    try {
      const [items, total] = await Promise.all([
        prisma.pantryItem.findMany({
          where,
          orderBy,
          skip: offset,
          take: limit,
        }),
        prisma.pantryItem.count({ where }),
      ]);

      // Get category counts for filtering
      const categoryStats = await prisma.pantryItem.groupBy({
        by: ['category'],
        where: { userId },
        _count: { category: true },
      });

      const categories = categoryStats.reduce((acc, stat) => {
        acc[stat.category] = stat._count.category;
        return acc;
      }, {} as Record<string, number>);

      return {
        items,
        total,
        hasMore: offset + items.length < total,
        categories,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('Failed to get pantry items:', error);
      throw error;
    }
  }

  async getStats(userId: string) {
    try {
      // Use caching for stats
      const cacheKey = `pantry_stats:${userId}`;
      const cached = await cache.get(cacheKey);
      
      if (cached) {
        return cached;
      }

      const [
        totalItems,
        locationStats,
        categoryStats,
        expiringSoon,
        lowStockItems,
      ] = await Promise.all([
        prisma.pantryItem.count({ where: { userId } }),
        
        prisma.pantryItem.groupBy({
          by: ['location'],
          where: { userId },
          _count: { location: true },
        }),
        
        prisma.pantryItem.groupBy({
          by: ['category'],
          where: { userId },
          _count: { category: true },
        }),
        
        prisma.pantryItem.count({
          where: {
            userId,
            expirationDate: {
              lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
              gte: new Date(),
            },
          },
        }),
        
        prisma.pantryItem.count({
          where: { userId, isLowStock: true },
        }),
      ]);

      const itemsByLocation = locationStats.reduce((acc, stat) => {
        acc[stat.location] = stat._count.location;
        return acc;
      }, {} as Record<string, number>);

      const itemsByCategory = categoryStats.reduce((acc, stat) => {
        acc[stat.category] = stat._count.category;
        return acc;
      }, {} as Record<string, number>);

      const stats = {
        totalItems,
        itemsByLocation,
        itemsByCategory,
        expiringSoon,
        lowStockItems,
      };

      // Cache for 5 minutes
      await cache.set(cacheKey, stats, 300);

      return stats;
    } catch (error) {
      logger.error('Failed to get pantry stats:', error);
      throw error;
    }
  }

  async getById(id: string, userId: string) {
    return prisma.pantryItem.findFirst({
      where: { id, userId },
    });
  }

  async create(itemData: any) {
    try {
      const normalised = coercePantryEnums(itemData);
      const item = await prisma.pantryItem.create({
        data: {
          ...normalised,
          // Calculate if item is low stock based on quantity and threshold
          isLowStock: normalised.quantity <= (normalised.lowStockThreshold || 1),
        },
      });

      // Invalidate cache
      await cache.del(`pantry_stats:${itemData.userId}`);

      return item;
    } catch (error) {
      logger.error('Failed to create pantry item:', error);
      throw error;
    }
  }

  async update(id: string, userId: string, rawUpdates: any) {
    try {
      // PATCH has no enum validator, so lowercase used to reach Prisma and throw.
      const updates = coercePantryEnums(rawUpdates);
      const item = await prisma.pantryItem.findFirst({
        where: { id, userId },
      });

      if (!item) {
        return null;
      }

      // Update low stock status if quantity or threshold changed
      if (updates.quantity !== undefined || updates.lowStockThreshold !== undefined) {
        const newQuantity = updates.quantity !== undefined ? updates.quantity : item.quantity;
        const newThreshold = updates.lowStockThreshold !== undefined ? updates.lowStockThreshold : item.lowStockThreshold;
        
        updates.isLowStock = newQuantity <= newThreshold;
      }

      const updatedItem = await prisma.pantryItem.update({
        where: { id },
        data: updates,
      });

      // Invalidate cache
      await cache.del(`pantry_stats:${userId}`);

      return updatedItem;
    } catch (error) {
      logger.error('Failed to update pantry item:', error);
      throw error;
    }
  }

  async delete(id: string, userId: string, reason?: 'used' | 'wasted') {
    try {
      const item = await prisma.pantryItem.findFirst({
        where: { id, userId },
      });

      if (!item) {
        return null;
      }

      if (reason) {
        await analyticsService.logWaste(userId, {
          itemName: item.name,
          category: item.category,
          action: reason,
          quantity: item.quantity,
          unit: item.unit,
        });
      }

      await prisma.pantryItem.delete({
        where: { id },
      });

      // Invalidate cache
      await cache.del(`pantry_stats:${userId}`);

      return true;
    } catch (error) {
      logger.error('Failed to delete pantry item:', error);
      throw error;
    }
  }

  async bulkUpdate(userId: string, items: Array<{ id: string; updates: any }>) {
    try {
      const updatedItems = [];

      for (const { id, updates } of items) {
        const item = await this.update(id, userId, updates);
        if (item) {
          updatedItems.push(item);
        }
      }

      return updatedItems;
    } catch (error) {
      logger.error('Failed to bulk update pantry items:', error);
      throw error;
    }
  }

  async exportUserData(userId: string, format: string = 'json') {
    try {
      const items = await prisma.pantryItem.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
      });

      if (format === 'csv') {
        return this.convertToCSV(items);
      }

      return JSON.stringify(items, null, 2);
    } catch (error) {
      logger.error('Failed to export pantry data:', error);
      throw error;
    }
  }

  private convertToCSV(items: any[]): string {
    if (items.length === 0) {
      return 'No items found';
    }

    const headers = [
      'Name',
      'Category',
      'Quantity',
      'Unit',
      'Location',
      'Purchase Date',
      'Expiration Date',
      'Brand',
      'Notes',
      'Is Low Stock',
      'Created At',
    ];

    const rows = items.map(item => [
      item.name,
      item.category,
      item.quantity,
      item.unit,
      item.location,
      item.purchaseDate?.toISOString().split('T')[0] || '',
      item.expirationDate?.toISOString().split('T')[0] || '',
      item.brand || '',
      item.notes || '',
      item.isLowStock ? 'Yes' : 'No',
      item.createdAt.toISOString().split('T')[0],
    ]);

    return [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');
  }

  // Helper method to check for expiring items
  async getExpiringItems(userId: string, daysAhead: number = 7) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    return prisma.pantryItem.findMany({
      where: {
        userId,
        expirationDate: {
          lte: futureDate,
          gte: new Date(),
        },
      },
      orderBy: { expirationDate: 'asc' },
    });
  }

  // Helper method to get low stock items
  async getLowStockItems(userId: string) {
    return prisma.pantryItem.findMany({
      where: {
        userId,
        isLowStock: true,
      },
      orderBy: { name: 'asc' },
    });
  }
}
