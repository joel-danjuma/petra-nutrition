import { z } from 'zod';
import { ItemCategorySchema, StorageLocationSchema } from './enums';

export const PantryItemSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1),
  category: ItemCategorySchema,
  quantity: z.number().min(0),
  unit: z.string(), // e.g., "pieces", "lbs", "cups", "bottles"
  location: StorageLocationSchema.default('PANTRY'),
  purchaseDate: z.date().optional(),
  expirationDate: z.date().optional(),
  barcode: z.string().optional(),
  brand: z.string().optional(),
  notes: z.string().optional(),
  imageUrl: z.string().url().optional(),
  nutritionPer100g: z.object({
    calories: z.number().optional(),
    protein: z.number().optional(),
    carbs: z.number().optional(),
    fat: z.number().optional(),
  }).optional(),
  isLowStock: z.boolean().default(false),
  lowStockThreshold: z.number().min(0).default(1),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreatePantryItemSchema = PantryItemSchema.omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const UpdatePantryItemSchema = PantryItemSchema.partial().omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const BulkUpdatePantryItemSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    updates: UpdatePantryItemSchema,
  })),
});

export const PantrySearchSchema = z.object({
  query: z.string().optional(),
  category: z.array(z.string()).optional(),
  location: z.array(StorageLocationSchema).optional(),
  isExpiringSoon: z.boolean().optional(), // within 7 days
  isLowStock: z.boolean().optional(),
  sortBy: z.enum(['name', 'expirationDate', 'purchaseDate', 'category', 'quantity']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

export const BarcodeRecognitionSchema = z.object({
  barcode: z.string().min(1),
});

export const ImageRecognitionSchema = z.object({
  imageBase64: z.string().min(1),
  context: z.enum(['pantry_item', 'fresh_produce', 'packaged_food']).default('pantry_item'),
});

export const RecognitionResultSchema = z.object({
  name: z.string(),
  category: z.string(),
  brand: z.string().optional(),
  estimatedQuantity: z.number().optional(),
  unit: z.string().optional(),
  confidence: z.number().min(0).max(1),
  nutritionPer100g: z.object({
    calories: z.number().optional(),
    protein: z.number().optional(),
    carbs: z.number().optional(),
    fat: z.number().optional(),
  }).optional(),
});

export type PantryItem = z.infer<typeof PantryItemSchema>;
export type CreatePantryItem = z.infer<typeof CreatePantryItemSchema>;
export type UpdatePantryItem = z.infer<typeof UpdatePantryItemSchema>;
export type BulkUpdatePantryItem = z.infer<typeof BulkUpdatePantryItemSchema>;
export type PantrySearch = z.infer<typeof PantrySearchSchema>;
export type BarcodeRecognition = z.infer<typeof BarcodeRecognitionSchema>;
export type ImageRecognition = z.infer<typeof ImageRecognitionSchema>;
export type RecognitionResult = z.infer<typeof RecognitionResultSchema>;

export interface PantrySearchResponse {
  items: PantryItem[];
  total: number;
  hasMore: boolean;
  categories: { [key: string]: number }; // category counts
}

export interface PantryStats {
  totalItems: number;
  itemsByLocation: { [key: string]: number };
  itemsByCategory: { [key: string]: number };
  expiringSoon: number; // items expiring within 7 days
  lowStockItems: number;
}
