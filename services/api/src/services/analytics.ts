import { prisma } from '../database';
import { logger } from '../utils/logger';

// Rough blended average grocery cost per gram (GBP), used only as an
// approximation for "value saved" — there is no per-item pricing data
// anywhere in the schema, so this is deliberately a single flat constant
// rather than a real pricing model.
const BLENDED_RATE_PER_GRAM = 0.006;

// Best-effort unit -> grams conversion. Units we can't confidently convert
// (counts like "bunch"/"head", or ambiguous units) return null rather than
// guessing.
function estimateWeightGrams(quantity: number, unit: string): number | null {
  const u = unit.trim().toLowerCase();
  if (['g', 'gram', 'grams'].includes(u)) return quantity;
  if (['kg', 'kilogram', 'kilograms'].includes(u)) return quantity * 1000;
  if (['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'].includes(u)) return quantity; // ~water density
  if (['l', 'liter', 'liters', 'litre', 'litres'].includes(u)) return quantity * 1000;
  return null;
}

const DEFAULT_TARGETS = {
  calories: 2150,
  proteinG: 140,
  fiberG: 30,
  vegServings: 5,
};

// Local calendar day at midnight, built from date components rather than
// round-tripping through a string parse — avoids UTC-conversion drift
// (`new Date(new Date().toDateString())` can land on the wrong day when the
// server's local timezone is ahead of UTC).
function localDateOnly(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function localDateLabel(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export class AnalyticsService {
  async logWaste(userId: string, body: {
    itemName: string;
    category: string;
    action: 'used' | 'wasted';
    quantity: number;
    unit: string;
    estimatedWeightGrams?: number;
  }) {
    const weightGrams = body.estimatedWeightGrams ?? estimateWeightGrams(body.quantity, body.unit);

    try {
      return await prisma.pantryWasteLog.create({
        data: {
          userId,
          itemName: body.itemName,
          category: body.category.toUpperCase() as any,
          action: body.action.toUpperCase() as any,
          quantity: body.quantity,
          unit: body.unit,
          estimatedWeightGrams: weightGrams ?? undefined,
          estimatedValue: weightGrams != null ? weightGrams * BLENDED_RATE_PER_GRAM : undefined,
        },
      });
    } catch (error) {
      logger.error('Failed to log waste event:', error);
      throw error;
    }
  }

  async getWasteSummary(userId: string) {
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [usedLogs, thisMonthUsedLogs, wastedByCategory] = await Promise.all([
        prisma.pantryWasteLog.findMany({
          where: { userId, action: 'USED' },
          select: { estimatedWeightGrams: true, estimatedValue: true },
        }),
        prisma.pantryWasteLog.findMany({
          where: { userId, action: 'USED', occurredAt: { gte: startOfMonth } },
          select: { estimatedWeightGrams: true },
        }),
        prisma.pantryWasteLog.groupBy({
          by: ['category'],
          where: { userId, action: 'WASTED' },
          _count: { category: true },
          orderBy: { _count: { category: 'desc' } },
          take: 1,
        }),
      ]);

      const totalGrams = usedLogs.reduce((sum, l) => sum + (l.estimatedWeightGrams ?? 0), 0);
      const totalValue = usedLogs.reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0);
      const thisMonthGrams = thisMonthUsedLogs.reduce((sum, l) => sum + (l.estimatedWeightGrams ?? 0), 0);

      return {
        totalKgSaved: Math.round((totalGrams / 1000) * 100) / 100,
        totalValueSaved: Math.round(totalValue * 100) / 100,
        thisMonthKgSaved: Math.round((thisMonthGrams / 1000) * 100) / 100,
        itemsSaved: usedLogs.length,
        weakSpotCategory: wastedByCategory[0]?.category ?? null,
        sinceDate: (await this.getAccountCreatedAt(userId)).toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get waste summary:', error);
      throw error;
    }
  }

  private async getAccountCreatedAt(userId: string): Promise<Date> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
    return user?.createdAt ?? new Date();
  }

  async logMealCompletion(userId: string, body: {
    recipeId?: string;
    mealType?: string;
    calories: number;
    protein: number;
    fiber?: number;
    servings?: number;
  }) {
    try {
      return await prisma.mealCompletion.create({
        data: {
          userId,
          recipeId: body.recipeId,
          mealType: body.mealType ? (body.mealType.toUpperCase() as any) : undefined,
          date: localDateOnly(),
          calories: body.calories,
          protein: body.protein,
          fiber: body.fiber,
          servings: body.servings ?? 1,
        },
      });
    } catch (error) {
      logger.error('Failed to log meal completion:', error);
      throw error;
    }
  }

  async getTodayNutrition(userId: string) {
    try {
      const startOfDay = localDateOnly();
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

      const [completions, profile] = await Promise.all([
        prisma.mealCompletion.findMany({
          where: { userId, date: { gte: startOfDay, lt: endOfDay } },
        }),
        prisma.userProfile.findUnique({ where: { userId } }),
      ]);

      const caloriesConsumed = completions.reduce((sum, c) => sum + c.calories, 0);
      const proteinG = completions.reduce((sum, c) => sum + c.protein, 0);
      const fiberG = completions.reduce((sum, c) => sum + (c.fiber ?? 0), 0);
      // No per-meal vegetable-serving field exists yet — approximate one
      // veg serving per completed meal that has any fiber logged.
      const vegServings = completions.filter(c => (c.fiber ?? 0) > 0).length;

      return {
        date: localDateLabel(startOfDay),
        caloriesConsumed,
        proteinG,
        fiberG,
        vegServings,
        targets: {
          calories: profile?.dailyCalorieTarget ?? DEFAULT_TARGETS.calories,
          proteinG: profile?.dailyProteinTarget ?? DEFAULT_TARGETS.proteinG,
          fiberG: profile?.dailyFiberTarget ?? DEFAULT_TARGETS.fiberG,
          vegServings: profile?.dailyVegServings ?? DEFAULT_TARGETS.vegServings,
        },
      };
    } catch (error) {
      logger.error('Failed to get today nutrition:', error);
      throw error;
    }
  }
}
