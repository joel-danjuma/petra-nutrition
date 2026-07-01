import { z } from 'zod';

export const NutritionSchema = z.object({
  calories: z.number().min(0),
  protein: z.number().min(0), // in grams
  carbs: z.number().min(0), // in grams
  fat: z.number().min(0), // in grams
  fiber: z.number().min(0).optional(), // in grams
  sugar: z.number().min(0).optional(), // in grams
  sodium: z.number().min(0).optional(), // in mg
});

export const IngredientSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  amount: z.number().min(0),
  unit: z.string(), // e.g., "cups", "tbsp", "grams", "pieces"
  notes: z.string().optional(),
});

export const InstructionSchema = z.object({
  step: z.number().min(1),
  instruction: z.string().min(1),
  duration: z.number().optional(), // in minutes
});

export const RecipeSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  servings: z.number().min(1),
  prepTime: z.number().min(0), // in minutes
  cookTime: z.number().min(0), // in minutes
  totalTime: z.number().min(0), // in minutes
  difficulty: z.enum(['easy', 'medium', 'hard']),
  cuisine: z.string().optional(),
  dietaryTags: z.array(z.string()).default([]), // e.g., "vegetarian", "gluten-free", "keto"
  ingredients: z.array(IngredientSchema),
  instructions: z.array(InstructionSchema),
  nutrition: NutritionSchema.optional(),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().min(0).default(0),
  createdBy: z.string().uuid().optional(), // user ID
  isAIGenerated: z.boolean().default(false),
  source: z.string().optional(), // URL or source name
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateRecipeSchema = RecipeSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  rating: true,
  reviewCount: true,
});

export const UpdateRecipeSchema = RecipeSchema.partial().omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const RecipeSearchSchema = z.object({
  query: z.string().optional(),
  cuisine: z.string().optional(),
  dietaryTags: z.array(z.string()).optional(),
  maxPrepTime: z.number().optional(),
  maxCookTime: z.number().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  ingredients: z.array(z.string()).optional(), // search by available ingredients
  minRating: z.number().min(0).max(5).optional(),
  limit: z.number().min(1).max(50).default(20),
  offset: z.number().min(0).default(0),
});

export const RecipeGenerationRequestSchema = z.object({
  prompt: z.string().min(1),
  dietaryRestrictions: z.array(z.string()).optional(),
  availableIngredients: z.array(z.string()).optional(),
  servings: z.number().min(1).optional(),
  maxPrepTime: z.number().optional(),
  cuisine: z.string().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});

export type Nutrition = z.infer<typeof NutritionSchema>;
export type Ingredient = z.infer<typeof IngredientSchema>;
export type Instruction = z.infer<typeof InstructionSchema>;
export type Recipe = z.infer<typeof RecipeSchema>;
export type CreateRecipe = z.infer<typeof CreateRecipeSchema>;
export type UpdateRecipe = z.infer<typeof UpdateRecipeSchema>;
export type RecipeSearch = z.infer<typeof RecipeSearchSchema>;
export type RecipeGenerationRequest = z.infer<typeof RecipeGenerationRequestSchema>;

export interface RecipeSearchResponse {
  recipes: Recipe[];
  total: number;
  hasMore: boolean;
}
