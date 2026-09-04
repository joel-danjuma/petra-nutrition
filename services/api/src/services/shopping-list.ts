import { prisma } from '../database';
import { logger } from '../utils/logger';

/** Canonicalise a shopping-list item's enum fields before they reach Prisma. */
function coerceItemEnums<T extends Record<string, any>>(item: T): T {
  const out: Record<string, any> = { ...item };
  for (const field of ['category', 'priority'] as const) {
    if (typeof out[field] === 'string') out[field] = out[field].toUpperCase();
  }
  return out as T;
}

export class ShoppingListService {
  async getShoppingLists(userId: string, filters: any = {}) {
    const {
      query,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = filters;

    // Coerced here because this controller forwards `req.query` verbatim, so
    // pagination arrives as strings and Prisma rejects `take: "1"`.
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const offset = (page - 1) * limit;
    const where: any = { userId };

    if (query) {
      where.name = { contains: query, mode: 'insensitive' };
    }

    try {
      const [lists, total] = await Promise.all([
        prisma.shoppingList.findMany({
          where,
          include: {
            items: { orderBy: [{ category: 'asc' }, { name: 'asc' }] },
          },
          orderBy: { [sortBy]: sortOrder },
          skip: offset,
          take: limit,
        }),
        prisma.shoppingList.count({ where }),
      ]);

      return {
        shoppingLists: lists,
        total,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: offset + lists.length < total,
        },
      };
    } catch (error) {
      logger.error('Failed to get shopping lists:', error);
      throw error;
    }
  }

  async getById(id: string, userId: string) {
    try {
      return await prisma.shoppingList.findFirst({
        where: { id, userId },
        include: {
          items: { orderBy: [{ category: 'asc' }, { name: 'asc' }] },
          mealPlan: { select: { id: true, name: true } },
        },
      });
    } catch (error) {
      logger.error('Failed to get shopping list:', error);
      throw error;
    }
  }

  async create(data: any) {
    const { items, ...listData } = data;

    try {
      return await prisma.shoppingList.create({
        data: {
          ...listData,
          items: items?.length ? { create: items.map(coerceItemEnums) } : undefined,
        },
        include: {
          items: { orderBy: [{ category: 'asc' }, { name: 'asc' }] },
        },
      });
    } catch (error) {
      logger.error('Failed to create shopping list:', error);
      throw error;
    }
  }

  async update(id: string, userId: string, data: any) {
    try {
      const existing = await prisma.shoppingList.findFirst({ where: { id, userId } });
      if (!existing) return null;

      return await prisma.shoppingList.update({
        where: { id },
        data,
        include: {
          items: { orderBy: [{ category: 'asc' }, { name: 'asc' }] },
        },
      });
    } catch (error) {
      logger.error('Failed to update shopping list:', error);
      throw error;
    }
  }

  async delete(id: string, userId: string) {
    try {
      const existing = await prisma.shoppingList.findFirst({ where: { id, userId } });
      if (!existing) return null;

      await prisma.shoppingList.delete({ where: { id } });
      return true;
    } catch (error) {
      logger.error('Failed to delete shopping list:', error);
      throw error;
    }
  }

  async generateFromMealPlan(mealPlanId: string, userId: string, name?: string) {
    try {
      const mealPlan = await prisma.mealPlan.findFirst({
        where: { id: mealPlanId, userId },
        include: {
          meals: {
            include: {
              recipe: {
                include: { ingredients: true },
              },
            },
          },
        },
      });

      if (!mealPlan) return null;

      // Gather all ingredients from meal plan recipes
      const ingredientMap = new Map<string, any>();

      for (const meal of mealPlan.meals) {
        if (!meal.recipe) continue;
        for (const ingredient of meal.recipe.ingredients) {
          const key = `${ingredient.name.toLowerCase()}_${ingredient.unit}`;
          if (ingredientMap.has(key)) {
            const existing = ingredientMap.get(key);
            existing.quantity += ingredient.amount * meal.servings;
          } else {
            ingredientMap.set(key, {
              name: ingredient.name,
              quantity: ingredient.amount * meal.servings,
              unit: ingredient.unit,
              recipeId: meal.recipeId,
              recipeName: meal.recipe.title,
              category: 'OTHER',
              priority: 'MEDIUM',
              isCompleted: false,
            });
          }
        }
      }

      // Cross-reference with pantry to remove already stocked items
      const pantryItems = await prisma.pantryItem.findMany({
        where: { userId },
        select: { name: true, quantity: true, unit: true },
      });

      const pantryMap = new Map<string, number>(
        pantryItems.map(p => [p.name.toLowerCase(), p.quantity])
      );

      const shoppingItems = [];
      for (const [, item] of ingredientMap) {
        const inPantry = pantryMap.get(item.name.toLowerCase()) ?? 0;
        const needed = item.quantity - inPantry;
        if (needed > 0) {
          shoppingItems.push({ ...item, quantity: needed });
        }
      }

      return await prisma.shoppingList.create({
        data: {
          userId,
          mealPlanId,
          name: name || `Shopping list for ${mealPlan.name}`,
          items: shoppingItems.length ? { create: shoppingItems } : undefined,
        },
        include: {
          items: { orderBy: [{ category: 'asc' }, { name: 'asc' }] },
        },
      });
    } catch (error) {
      logger.error('Failed to generate shopping list from meal plan:', error);
      throw error;
    }
  }

  async updateItems(id: string, userId: string, items: any[]) {
    try {
      const existing = await prisma.shoppingList.findFirst({ where: { id, userId } });
      if (!existing) return null;

      // Upsert each item
      await Promise.all(
        items.map(item =>
          item.id
            ? prisma.shoppingListItem.update({ where: { id: item.id }, data: coerceItemEnums(item) })
            : prisma.shoppingListItem.create({ data: { ...coerceItemEnums(item), shoppingListId: id } })
        )
      );

      return this.getById(id, userId);
    } catch (error) {
      logger.error('Failed to update shopping list items:', error);
      throw error;
    }
  }

  async markComplete(id: string, userId: string) {
    try {
      const existing = await prisma.shoppingList.findFirst({ where: { id, userId } });
      if (!existing) return null;

      return await prisma.shoppingList.update({
        where: { id },
        data: {
          isCompleted: true,
          completedAt: new Date(),
        },
        include: { items: true },
      });
    } catch (error) {
      logger.error('Failed to mark shopping list complete:', error);
      throw error;
    }
  }

  async exportList(id: string, userId: string, format = 'json') {
    try {
      const list = await this.getById(id, userId);
      if (!list) return null;

      if (format === 'csv') {
        const header = 'Name,Quantity,Unit,Category,Completed\n';
        const rows = list.items
          .map((i: any) => `"${i.name}",${i.quantity},"${i.unit}","${i.category}",${i.isCompleted}`)
          .join('\n');
        return header + rows;
      }

      return JSON.stringify(list, null, 2);
    } catch (error) {
      logger.error('Failed to export shopping list:', error);
      throw error;
    }
  }
}
