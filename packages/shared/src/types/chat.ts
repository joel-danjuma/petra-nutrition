import { z } from 'zod';
import {
  chatResponseTypeSchema,
  generatedRecipeSchema,
  nutritionBreakdownSchema,
  type GeneratedRecipe,
  type NutritionBreakdown,
} from '@petra/agent-contract';
import { MessageRoleSchema } from './enums';

/**
 * The chat payloads are the agent contract's, not copies of it.
 *
 * The apps used to declare their own `GeneratedRecipe` and `Nutrition` — four
 * hand-written copies of one schema, already disagreeing about which fields
 * were optional. Re-exported as types only, which keeps this file safe to
 * import from a React Server Component (see `core.ts`).
 */
export type {
  ChatResponse,
  ChatResponseType,
  GeneratedRecipe,
  GraphNode,
  NutritionBreakdown,
  NutritionFacts,
} from '@petra/agent-contract';

export const MessageContentSchema = z.object({
  type: z.enum(['text', 'image', 'recipe_card', 'meal_plan_card', 'shopping_list_card']),
  text: z.string().optional(),
  imageUrl: z.string().url().optional(),
  imageBase64: z.string().optional(),
  metadata: z.record(z.any()).optional(), // for structured data like recipe IDs, etc.
});

/**
 * What the API stores beside an assistant message: the reply's own fields, so
 * a reloaded conversation renders exactly what the live one did.
 *
 * Mirrors `storedMetadata` in services/api/src/services/chat-turn.ts — nine
 * fields. The schema this replaces listed model, tokens and processing time,
 * which no path has ever written. User messages carry no metadata, hence
 * `nullish` on the message.
 */
export const StoredReplyMetadataSchema = z.object({
  type: chatResponseTypeSchema.optional(),
  confidence: z.number().optional(),
  structuredData: z.unknown().optional(),
  /** A library recipe the reply recommended. */
  recipeId: z.string().optional(),
  /** A dish the assistant composed; no row exists behind it until saved. */
  generatedRecipe: generatedRecipeSchema.optional(),
  nutrition: nutritionBreakdownSchema.optional(),
  assumptions: z.array(z.string()).optional(),
  compromises: z.array(z.string()).optional(),
  suggestions: z.array(z.string()).optional(),
});

export const ChatMessageSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  role: MessageRoleSchema,
  content: z.array(MessageContentSchema),
  timestamp: z.date(),
  isStreaming: z.boolean().default(false),
  metadata: StoredReplyMetadataSchema.nullish(),
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

export type StoredReplyMetadata = z.infer<typeof StoredReplyMetadataSchema>;

/**
 * A message as the API sends it, from `GET /chat/sessions/:id` or inside a
 * `/chat/message` reply. Looser than `ChatMessage`: over JSON the timestamp is
 * a string, and `content` is a block array on new rows but a plain string on
 * old ones.
 */
export interface StoredChatMessage {
  id?: string;
  role: string;
  content: unknown;
  timestamp?: string | Date;
  metadata?: unknown;
}

/**
 * A library recipe, hydrated by the API so the chat card renders without a
 * second request. Only the whole-reply endpoint sends one; a streamed reply
 * carries the `recipeId` alone.
 */
export interface ChatRecipeCard {
  id: string;
  title: string;
  imageUrl: string | null;
  totalTime: number | null;
  servings: number | null;
  dietaryTags: string[];
  nutrition: { calories: number; protein: number } | null;
}

/** `data` of `POST /chat/message`. */
export interface ChatMessageResponse {
  /** The stored assistant message, metadata included. */
  message: StoredChatMessage;
  content: string;
  recipe: ChatRecipeCard | null;
  suggestions?: string[];
  generatedRecipe?: GeneratedRecipe;
  nutrition?: NutritionBreakdown;
  assumptions: string[];
  compromises: string[];
}

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
