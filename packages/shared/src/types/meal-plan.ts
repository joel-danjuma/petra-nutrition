import { z } from 'zod';
import { RecipeSchema, NutritionSchema } from './recipe';

export const MealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);

export const MealSchema = z.object({
  id: z.string().uuid(),
  type: MealTypeSchema,
  recipeId: z.string().uuid().optional(),
  recipe: RecipeSchema.optional(),
  customName: z.string().optional(), // for non-recipe meals
  servings: z.number().min(1).default(1),
  notes: z.string().optional(),
  nutrition: NutritionSchema.optional(),
});

export const MealPlanDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD format
  meals: z.array(MealSchema),
  totalNutrition: NutritionSchema.optional(),
});

export const MealPlanSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.array(MealPlanDaySchema),
  isTemplate: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  targetNutrition: z.object({
    dailyCalories: z.number().min(0).optional(),
    dailyProtein: z.number().min(0).optional(),
    dailyCarbs: z.number().min(0).optional(),
    dailyFat: z.number().min(0).optional(),
  }).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateMealPlanSchema = MealPlanSchema.omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const UpdateMealPlanSchema = MealPlanSchema.partial().omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const MealPlanGenerationRequestSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.number().min(1).max(14), // free users limited to 1 day
  dietaryRestrictions: z.array(z.string()).optional(),
  cuisinePreferences: z.array(z.string()).optional(),
  targetCalories: z.number().min(800).max(5000).optional(),
  mealsPerDay: z.array(MealTypeSchema).default(['breakfast', 'lunch', 'dinner']),
  avoidIngredients: z.array(z.string()).optional(),
  preferredIngredients: z.array(z.string()).optional(), // from pantry
  complexity: z.enum(['simple', 'moderate', 'complex']).default('moderate'),
  cookingTimeLimit: z.number().optional(), // max minutes per meal
});

export const QuickMealSuggestionSchema = z.object({
  mealType: MealTypeSchema,
  availableIngredients: z.array(z.string()).optional(),
  maxPrepTime: z.number().optional(),
  dietaryRestrictions: z.array(z.string()).optional(),
});

export const MealPlanSearchSchema = z.object({
  query: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isTemplate: z.boolean().optional(),
  startDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.number().min(1).max(50).default(20),
  offset: z.number().min(0).default(0),
});

export type MealType = z.infer<typeof MealTypeSchema>;
export type Meal = z.infer<typeof MealSchema>;
export type MealPlanDay = z.infer<typeof MealPlanDaySchema>;
export type MealPlan = z.infer<typeof MealPlanSchema>;
export type CreateMealPlan = z.infer<typeof CreateMealPlanSchema>;
export type UpdateMealPlan = z.infer<typeof UpdateMealPlanSchema>;
export type MealPlanGenerationRequest = z.infer<typeof MealPlanGenerationRequestSchema>;
export type QuickMealSuggestion = z.infer<typeof QuickMealSuggestionSchema>;
export type MealPlanSearch = z.infer<typeof MealPlanSearchSchema>;

export interface MealPlanSearchResponse {
  mealPlans: MealPlan[];
  total: number;
  hasMore: boolean;
}

export interface MealPlanNutritionSummary {
  totalDays: number;
  averageDailyCalories: number;
  averageDailyProtein: number;
  averageDailyCarbs: number;
  averageDailyFat: number;
  nutritionByDay: Array<{
    date: string;
    nutrition: NutritionSchema;
  }>;
}
