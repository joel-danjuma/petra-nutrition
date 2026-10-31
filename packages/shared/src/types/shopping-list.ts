import { z } from 'zod';
import { ItemCategorySchema, PrioritySchema } from './enums';

export const ShoppingListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  quantity: z.number().min(0),
  unit: z.string(),
  category: ItemCategorySchema,
  isCompleted: z.boolean().default(false),
  estimatedPrice: z.number().min(0).optional(),
  notes: z.string().optional(),
  recipeId: z.string().uuid().optional(), // if item is from a recipe
  recipeName: z.string().optional(),
  priority: PrioritySchema.default('MEDIUM'),
  store: z.string().optional(), // preferred store for this item
});

export const ShoppingListSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  items: z.array(ShoppingListItemSchema),
  isTemplate: z.boolean().default(false),
  mealPlanId: z.string().uuid().optional(), // if generated from meal plan
  estimatedTotal: z.number().min(0).optional(),
  targetStore: z.string().optional(),
  tags: z.array(z.string()).default([]),
  isCompleted: z.boolean().default(false),
  completedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateShoppingListSchema = ShoppingListSchema.omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const UpdateShoppingListSchema = ShoppingListSchema.partial().omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const GenerateShoppingListSchema = z.object({
  mealPlanId: z.string().uuid(),
  includePantryCheck: z.boolean().default(true), // cross-reference with pantry
  includeEstimates: z.boolean().default(true), // include price estimates
  groupByStore: z.boolean().default(false), // create separate lists per store
  preferredStores: z.array(z.string()).optional(),
});

/**
 * One element of a `PATCH /shopping-lists/:id/items` body.
 *
 * The endpoint is an upsert and the `id` field is what selects the branch: an
 * element **with** an id updates that item, an element **without** one creates
 * a new item on the list. Items the body does not mention are left alone, so a
 * partial array is an addition, never a replacement.
 *
 * This schema previously described a `{ itemId, updates: {...} }` envelope that
 * the API has never implemented, so every mobile call was rejected with "items
 * must be an array" while the web client — which sends this shape — worked. It
 * also could not express a create at all, since it required `itemId`.
 */
export const ShoppingListItemUpsertSchema = z.union([
  ShoppingListItemSchema.omit({ id: true }),
  ShoppingListItemSchema.partial().required({ id: true }),
]);

export const BulkUpsertShoppingListItemsSchema = z.object({
  items: z.array(ShoppingListItemUpsertSchema),
});

export const ShoppingListSearchSchema = z.object({
  query: z.string().optional(),
  isCompleted: z.boolean().optional(),
  isTemplate: z.boolean().optional(),
  mealPlanId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().min(1).max(50).default(20),
  offset: z.number().min(0).default(0),
});

export const SmartSuggestionSchema = z.object({
  pantryItems: z.array(z.string()).optional(), // current pantry items
  recentPurchases: z.array(z.string()).optional(), // recently bought items
  dietaryPreferences: z.array(z.string()).optional(),
  budget: z.number().min(0).optional(),
});

export type ShoppingListItem = z.infer<typeof ShoppingListItemSchema>;
export type ShoppingList = z.infer<typeof ShoppingListSchema>;
export type CreateShoppingList = z.infer<typeof CreateShoppingListSchema>;
export type UpdateShoppingList = z.infer<typeof UpdateShoppingListSchema>;
export type GenerateShoppingList = z.infer<typeof GenerateShoppingListSchema>;
export type ShoppingListItemUpsert = z.infer<typeof ShoppingListItemUpsertSchema>;
export type BulkUpsertShoppingListItems = z.infer<typeof BulkUpsertShoppingListItemsSchema>;
export type ShoppingListSearch = z.infer<typeof ShoppingListSearchSchema>;
export type SmartSuggestion = z.infer<typeof SmartSuggestionSchema>;

export interface ShoppingListSearchResponse {
  shoppingLists: ShoppingList[];
  total: number;
  hasMore: boolean;
}

export interface ShoppingListStats {
  totalItems: number;
  completedItems: number;
  estimatedTotal: number;
  itemsByCategory: { [key: string]: number };
  completionRate: number; // percentage
}

export interface SmartSuggestionResponse {
  suggestedItems: Array<{
    name: string;
    category: string;
    reason: string; // why it's suggested
    priority: 'low' | 'medium' | 'high';
    estimatedPrice: number;
  }>;
  budgetAnalysis?: {
    estimatedTotal: number;
    withinBudget: boolean;
    alternatives: Array<{
      original: string;
      alternative: string;
      savings: number;
    }>;
  };
}
