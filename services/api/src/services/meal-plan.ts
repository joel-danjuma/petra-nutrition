import { prisma } from '../database';
import { logger } from '../utils/logger';

export class MealPlanService {
  async getMealPlans(userId: string, filters: any = {}) {
    const {
      query,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = filters;

    // These arrive straight off `req.query`, so they are strings. Passing them
    // through unconverted made Prisma reject `take: "1"` — which meant any
    // request with a `limit` (including Today's `?limit=1`) returned a 500.
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const offset = (page - 1) * limit;
    const where: any = { userId, isTemplate: false };

    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }

    try {
      const [mealPlans, total] = await Promise.all([
        prisma.mealPlan.findMany({
          where,
          include: {
            meals: {
              include: {
                recipe: {
                  // Enough to render a recipe card without a second request —
                  // Today's hero and the plan's meal cards both need imagery,
                  // servings and macros, not just a title and a duration.
                  select: {
                    id: true,
                    title: true,
                    imageUrl: true,
                    prepTime: true,
                    cookTime: true,
                    totalTime: true,
                    servings: true,
                    dietaryTags: true,
                    nutrition: { select: { calories: true, protein: true } },
                  },
                },
              },
              orderBy: [{ date: 'asc' }, { mealType: 'asc' }],
            },
          },
          orderBy: { [sortBy]: sortOrder },
          skip: offset,
          take: limit,
        }),
        prisma.mealPlan.count({ where }),
      ]);

      return {
        mealPlans,
        total,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: offset + mealPlans.length < total,
        },
      };
    } catch (error) {
      logger.error('Failed to get meal plans:', error);
      throw error;
    }
  }

  async getById(id: string, userId: string) {
    try {
      return await prisma.mealPlan.findFirst({
        where: { id, userId },
        include: {
          meals: {
            include: {
              recipe: {
                include: {
                  ingredients: { orderBy: { order: 'asc' } },
                  nutrition: true,
                },
              },
            },
            orderBy: [{ date: 'asc' }, { mealType: 'asc' }],
          },
        },
      });
    } catch (error) {
      logger.error('Failed to get meal plan:', error);
      throw error;
    }
  }

  async create(data: any) {
    const { meals, ...planData } = data;

    try {
      return await prisma.mealPlan.create({
        data: {
          ...planData,
          meals: meals?.length ? { create: meals } : undefined,
        },
        include: {
          meals: {
            include: { recipe: true },
            orderBy: [{ date: 'asc' }, { mealType: 'asc' }],
          },
        },
      });
    } catch (error) {
      logger.error('Failed to create meal plan:', error);
      throw error;
    }
  }

  async update(id: string, userId: string, data: any) {
    try {
      const existing = await prisma.mealPlan.findFirst({ where: { id, userId } });
      if (!existing) return null;

      return await prisma.mealPlan.update({
        where: { id },
        data,
        include: {
          meals: {
            include: { recipe: true },
            orderBy: [{ date: 'asc' }, { mealType: 'asc' }],
          },
        },
      });
    } catch (error) {
      logger.error('Failed to update meal plan:', error);
      throw error;
    }
  }

  async delete(id: string, userId: string) {
    try {
      const existing = await prisma.mealPlan.findFirst({ where: { id, userId } });
      if (!existing) return null;

      await prisma.mealPlan.delete({ where: { id } });
      return true;
    } catch (error) {
      logger.error('Failed to delete meal plan:', error);
      throw error;
    }
  }

  async duplicate(id: string, userId: string) {
    try {
      const original = await this.getById(id, userId);
      if (!original) return null;

      const { id: _id, createdAt, updatedAt, meals, ...planData } = original as any;

      return await prisma.mealPlan.create({
        data: {
          ...planData,
          name: `${planData.name} (Copy)`,
          meals: meals?.length
            ? {
                create: meals.map(({ id: _mid, mealPlanId: _mpid, recipe: _r, ...meal }: any) => meal),
              }
            : undefined,
        },
        include: {
          meals: {
            include: { recipe: true },
            orderBy: [{ date: 'asc' }, { mealType: 'asc' }],
          },
        },
      });
    } catch (error) {
      logger.error('Failed to duplicate meal plan:', error);
      throw error;
    }
  }

  async saveAsTemplate(id: string, userId: string) {
    try {
      const existing = await prisma.mealPlan.findFirst({ where: { id, userId } });
      if (!existing) return null;

      return await prisma.mealPlan.update({
        where: { id },
        data: { isTemplate: true },
      });
    } catch (error) {
      logger.error('Failed to save meal plan as template:', error);
      throw error;
    }
  }

  async getNutritionSummary(id: string, userId: string) {
    try {
      const mealPlan = await prisma.mealPlan.findFirst({
        where: { id, userId },
        include: {
          meals: {
            include: {
              recipe: { include: { nutrition: true } },
            },
          },
        },
      });

      if (!mealPlan) return null;

      const dailyNutrition: Record<string, any> = {};

      for (const meal of mealPlan.meals) {
        const dateKey = meal.date.toISOString().split('T')[0];
        if (!dailyNutrition[dateKey]) {
          dailyNutrition[dateKey] = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
        }

        if (meal.recipe?.nutrition) {
          const n = meal.recipe.nutrition;
          const servings = meal.servings;
          dailyNutrition[dateKey].calories += (n.calories * servings);
          dailyNutrition[dateKey].protein += (n.protein * servings);
          dailyNutrition[dateKey].carbs += (n.carbs * servings);
          dailyNutrition[dateKey].fat += (n.fat * servings);
          dailyNutrition[dateKey].fiber += ((n.fiber ?? 0) * servings);
        }
      }

      const days = Object.values(dailyNutrition);
      const totals = days.reduce(
        (acc: any, d: any) => ({
          calories: acc.calories + d.calories,
          protein: acc.protein + d.protein,
          carbs: acc.carbs + d.carbs,
          fat: acc.fat + d.fat,
          fiber: acc.fiber + d.fiber,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
      );

      const dayCount = days.length || 1;
      const averages = {
        calories: Math.round(totals.calories / dayCount),
        protein: Math.round(totals.protein / dayCount * 10) / 10,
        carbs: Math.round(totals.carbs / dayCount * 10) / 10,
        fat: Math.round(totals.fat / dayCount * 10) / 10,
        fiber: Math.round(totals.fiber / dayCount * 10) / 10,
      };

      return {
        dailyNutrition,
        totals,
        averages,
        dayCount,
      };
    } catch (error) {
      logger.error('Failed to get nutrition summary:', error);
      throw error;
    }
  }
}
