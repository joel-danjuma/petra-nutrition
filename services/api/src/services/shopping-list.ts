import { prisma } from '../database';
import { describeQuantity, findInPantry } from './pantry-match';
import { combine, dedupeItems, lineKey, mergeInto } from './shopping-merge';
import { ValidationError } from '../middleware/error';
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
          // One row per item, even if the caller sent the same thing twice.
          items: items?.length ? { create: dedupeItems(items).map(coerceItemEnums) } : undefined,
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

      // Gather every ingredient line, grouped by what the item *is* rather
      // than how each recipe spelled it, then total each group once — the
      // same milk in ml, g and cups becomes one line.
      const lines = new Map<string, any[]>();
      for (const meal of mealPlan.meals) {
        if (!meal.recipe) continue;
        for (const ingredient of meal.recipe.ingredients) {
          const key = lineKey(ingredient);
          lines.set(key, [
            ...(lines.get(key) ?? []),
            {
              name: ingredient.name,
              quantity: ingredient.amount * meal.servings,
              unit: ingredient.unit,
              recipeId: meal.recipeId,
              recipeName: meal.recipe.title,
              category: 'OTHER',
              priority: 'MEDIUM',
              isCompleted: false,
            },
          ]);
        }
      }
      const ingredientMap = new Map(
        [...lines].map(([key, group]) => [key, group.length === 1 ? group[0] : combine(group)])
      );

      // Cross-reference with the pantry. Anything it already covers is left
      // off the list but remembered, so the list can say why ("Skipped —
      // already in your kitchen") instead of silently being shorter.
      const pantryItems = await prisma.pantryItem.findMany({
        where: { userId },
        select: { name: true, quantity: true, unit: true, location: true },
      });

      const shoppingItems = [];
      const skippedItems: Array<{ name: string; have: string; location: string }> = [];
      for (const [, item] of ingredientMap) {
        const stocked = findInPantry(item.name, pantryItems);
        // Same arithmetic as before this change (quantities compared as plain
        // numbers, units notwithstanding); only the matching got smarter.
        const inPantry = stocked?.quantity ?? 0;
        const needed = item.quantity - inPantry;
        if (needed > 0) {
          shoppingItems.push({ ...item, quantity: needed });
        } else if (stocked) {
          skippedItems.push({
            name: item.name,
            have: describeQuantity(stocked),
            location: stocked.location,
          });
        }
      }

      return await prisma.shoppingList.create({
        data: {
          userId,
          mealPlanId,
          name: name || `Shopping list for ${mealPlan.name}`,
          items: shoppingItems.length ? { create: shoppingItems } : undefined,
          skippedItems: skippedItems.length ? skippedItems : undefined,
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

  /**
   * Upsert items on a list: an element carrying an `id` updates that item, one
   * without creates a new item. Items the body omits are left alone, so a
   * partial array adds rather than replaces.
   */
  async updateItems(id: string, userId: string, items: any[]) {
    try {
      const existing = await prisma.shoppingList.findFirst({
        where: { id, userId },
        include: { items: true },
      });
      if (!existing) return null;

      // Ownership was checked for the list but never for the items, so an id
      // from somebody else's list would have been updated quite happily — and
      // since a client posts the whole row back, moved onto this one too.
      const own = new Set(existing.items.map(item => item.id));
      const foreign = items.filter(item => item.id && !own.has(item.id));
      if (foreign.length) {
        throw new ValidationError(
          `${foreign.length === 1 ? 'An item does' : 'Some items do'} not belong to this list`
        );
      }

      // A new item that is already on the list does not become a second row:
      // it tops up the one that is there (and un-ticks it — it is needed
      // again). New items in the same request are collapsed first, so "add
      // all missing ingredients" from two recipes cannot duplicate either.
      const onList = new Map(existing.items.map(item => [lineKey(item), item]));
      const updates = items.filter(item => item.id);
      const creates: any[] = [];

      for (const item of dedupeItems(items.filter(item => !item.id))) {
        const match = onList.get(lineKey(item));
        if (match) {
          const merged = mergeInto(match, item);
          updates.push({
            id: match.id,
            quantity: merged.quantity,
            unit: merged.unit,
            recipeName: merged.recipeName,
            notes: merged.notes,
            isCompleted: false,
          });
        } else {
          creates.push(item);
        }
      }

      await Promise.all([
        ...updates.map(item => {
          const { id: itemId, ...data } = item;
          return prisma.shoppingListItem.update({ where: { id: itemId }, data: coerceItemEnums(data) });
        }),
        ...creates.map(item =>
          prisma.shoppingListItem.create({ data: { ...coerceItemEnums(item), shoppingListId: id } })
        ),
      ]);

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
