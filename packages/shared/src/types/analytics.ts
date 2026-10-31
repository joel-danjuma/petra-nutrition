import { z } from 'zod';
import { ItemCategorySchema, MealTypeSchema, WasteActionSchema } from './enums';

export const LogWasteEventSchema = z.object({
  itemName: z.string().min(1),
  category: ItemCategorySchema,
  action: WasteActionSchema,
  quantity: z.number().min(0),
  unit: z.string(),
  estimatedWeightGrams: z.number().optional(),
});

export const LogMealCompletionSchema = z.object({
  recipeId: z.string().uuid().optional(),
  mealType: MealTypeSchema.optional(),
  calories: z.number().min(0),
  protein: z.number().min(0),
  fiber: z.number().min(0).optional(),
  servings: z.number().int().min(1).default(1),
});

export const WasteSummarySchema = z.object({
  totalKgSaved: z.number(),
  totalValueSaved: z.number(),
  thisMonthKgSaved: z.number(),
  itemsSaved: z.number(),
  weakSpotCategory: z.string().nullable(),
  sinceDate: z.string(),
  /** This calendar month — the "less waste" report on Today and in the app. */
  month: z
    .object({
      /** e.g. "March" */
      label: z.string(),
      cookedInTimeKg: z.number(),
      wastedKg: z.number(),
      /** 0–100; null until anything with a known weight has been logged. */
      percentEaten: z.number().nullable(),
      recipesCooked: z.number(),
      /** An item thrown away 2+ times in the last 30 days. */
      overBought: z.object({ itemName: z.string(), times: z.number() }).nullable(),
    })
    .optional(),
});

export const TodayNutritionSchema = z.object({
  date: z.string(),
  caloriesConsumed: z.number(),
  proteinG: z.number(),
  fiberG: z.number(),
  vegServings: z.number(),
  targets: z.object({
    calories: z.number(),
    proteinG: z.number(),
    fiberG: z.number(),
    vegServings: z.number(),
  }),
});

export type LogWasteEvent = z.infer<typeof LogWasteEventSchema>;
export type LogMealCompletion = z.infer<typeof LogMealCompletionSchema>;
export type WasteSummary = z.infer<typeof WasteSummarySchema>;
export type TodayNutrition = z.infer<typeof TodayNutritionSchema>;
