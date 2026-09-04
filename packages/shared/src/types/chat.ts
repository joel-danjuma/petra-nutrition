import { z } from 'zod';
import { MessageRoleSchema } from './enums';


export const MessageContentSchema = z.object({
  type: z.enum(['text', 'image', 'recipe_card', 'meal_plan_card', 'shopping_list_card']),
  text: z.string().optional(),
  imageUrl: z.string().url().optional(),
  imageBase64: z.string().optional(),
  metadata: z.record(z.any()).optional(), // for structured data like recipe IDs, etc.
});

export const ChatMessageSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  role: MessageRoleSchema,
  content: z.array(MessageContentSchema),
  timestamp: z.date(),
  isStreaming: z.boolean().default(false),
  metadata: z.object({
    model: z.string().optional(), // which AI model was used
    tokens: z.number().optional(),
    processingTime: z.number().optional(), // in milliseconds
    confidence: z.number().min(0).max(1).optional(),
  }).optional(),
});

export const ChatSessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string().optional(), // auto-generated or user-set
  messages: z.array(ChatMessageSchema),
  context: z.object({
    userPreferences: z.record(z.any()).optional(),
    currentPantryItems: z.array(z.string()).optional(),
    activeMealPlan: z.string().uuid().optional(),
    lastRecipeSearch: z.string().optional(),
  }).optional(),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateChatSessionSchema = z.object({
  title: z.string().optional(),
  initialMessage: z.string().optional(),
});

export const SendMessageSchema = z.object({
  sessionId: z.string().uuid(),
  content: z.array(MessageContentSchema),
  context: z.object({
    includeUserProfile: z.boolean().default(true),
    includePantryItems: z.boolean().default(true),
    includeRecentRecipes: z.boolean().default(true),
    maxContextMessages: z.number().min(1).max(20).default(10),
  }).optional(),
});

export const ChatSessionSearchSchema = z.object({
  query: z.string().optional(),
  isActive: z.boolean().optional(),
  fromDate: z.date().optional(),
  toDate: z.date().optional(),
  limit: z.number().min(1).max(50).default(20),
  offset: z.number().min(0).default(0),
});

export const AICapabilitySchema = z.enum([
  'recipe_generation',
  'meal_planning',
  'pantry_management',
  'nutrition_analysis',
  'cooking_tips',
  'ingredient_substitution',
  'dietary_advice',
  'shopping_assistance',
  'image_recognition',
  'general_chat'
]);

export const AIResponseTypeSchema = z.enum([
  'text',
  'recipe_suggestion',
  'meal_plan_suggestion',
  'pantry_update',
  'shopping_list_generation',
  'nutrition_analysis',
  'cooking_instruction',
  'error'
]);

export const AIResponseSchema = z.object({
  type: AIResponseTypeSchema,
  content: z.string(),
  structuredData: z.record(z.any()).optional(), // for recipe data, meal plans, etc.
  suggestions: z.array(z.string()).optional(), // follow-up suggestions
  confidence: z.number().min(0).max(1).optional(),
  sources: z.array(z.string()).optional(), // source URLs or references
});

export type MessageContent = z.infer<typeof MessageContentSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatSession = z.infer<typeof ChatSessionSchema>;
export type CreateChatSession = z.infer<typeof CreateChatSessionSchema>;
export type SendMessage = z.infer<typeof SendMessageSchema>;
export type ChatSessionSearch = z.infer<typeof ChatSessionSearchSchema>;
export type AICapability = z.infer<typeof AICapabilitySchema>;
export type AIResponseType = z.infer<typeof AIResponseTypeSchema>;
export type AIResponse = z.infer<typeof AIResponseSchema>;

export interface ChatSessionSearchResponse {
  sessions: ChatSession[];
  total: number;
  hasMore: boolean;
}

export interface StreamingResponse {
  messageId: string;
  content: string;
  isComplete: boolean;
  metadata?: {
    tokens: number;
    processingTime: number;
  };
}

export interface ChatAnalytics {
  totalSessions: number;
  totalMessages: number;
  averageSessionLength: number; // in messages
  popularCapabilities: Array<{
    capability: AICapability;
    count: number;
  }>;
  userSatisfaction: {
    positiveInteractions: number;
    negativeInteractions: number;
    neutralInteractions: number;
  };
}
