import { z } from 'zod';

/**
 * The wire contract between the API gateway and the agent service.
 *
 * Both sides import these schemas: the API to build requests and parse
 * responses, the agent to validate what arrives and shape what it returns. A
 * drift between the two is therefore a type error at build time rather than a
 * malformed body discovered in production.
 *
 * The agent is stateless with respect to user data. Everything it needs about
 * the caller arrives in the request body; it persists nothing user-scoped and
 * has no access to the users, pantry or chat tables.
 */

export const AGENT_INTERNAL_KEY_HEADER = 'x-internal-key';

/* ------------------------------------------------------------------ shared */

export const chatRoleSchema = z.enum(['system', 'user', 'assistant']);

export const chatMessageSchema = z.object({
  role: chatRoleSchema,
  content: z.string(),
});

/**
 * The caller's identity, asserted by the API. The agent does not verify JWTs —
 * it is unroutable from outside and trusts the gateway, which has already
 * authenticated the request.
 */
export const agentUserSchema = z.object({
  id: z.string(),
  subscriptionTier: z.enum(['FREE', 'PREMIUM']).default('FREE'),
});

/**
 * What the API knows about the user and passes down. Note there is no
 * `retrievedRecipes` here: the agent owns the recipe index and retrieves for
 * itself, which is the whole point of the split.
 */
export const agentContextSchema = z.object({
  userPreferences: z.unknown().optional(),
  currentPantryItems: z.array(z.string()).default([]),
  /** Item names only, for the pantry-overlap retrieval signal. */
  pantryNames: z.array(z.string()).default([]),
  dietaryRestrictions: z.array(z.string()).default([]),
  healthGoals: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  activeMealPlan: z.string().optional(),
  lastRecipeSearch: z.string().optional(),
});

export const chatResponseTypeSchema = z.enum([
  'text',
  'recipe_suggestion',
  'meal_plan_suggestion',
  'pantry_update',
  'shopping_list_generation',
]);

export const chatResponseSchema = z.object({
  content: z.string(),
  type: chatResponseTypeSchema,
  structuredData: z.unknown().optional(),
  suggestions: z.array(z.string()).optional(),
  /** Set when the reply recommends a real recipe; drives the chat card. */
  recipeId: z.string().optional(),
  confidence: z.number().optional(),
  /** Observability, not product surface — logged by the gateway. */
  model: z.string().optional(),
  tokensUsed: z.number().optional(),
});

/* -------------------------------------------------------------------- chat */

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1),
  user: agentUserSchema,
  context: agentContextSchema.optional(),
  options: z
    .object({
      /**
       * Force the large model. Normally left unset: the agent decides from the
       * message itself, and defaulting to the fast model is what keeps the
       * daily token budget from being drained in an afternoon.
       */
      advancedModel: z.boolean().optional(),
      maxRetrieved: z.number().int().min(0).max(20).optional(),
    })
    .optional(),
});

/* ------------------------------------------------------------ SSE envelope */

/**
 * Server-sent event names for `POST /v1/chat/stream`.
 *
 * `error` exists because once the first chunk is out the status line is
 * already 200 — a mid-stream failure cannot be an HTTP error and has to be a
 * frame both ends agree on, or the client hangs forever.
 */
export const streamEventSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('chunk'), data: z.object({ content: z.string() }) }),
  z.object({ event: z.literal('done'), data: chatResponseSchema }),
  z.object({
    event: z.literal('error'),
    data: z.object({ code: z.string(), message: z.string() }),
  }),
]);

/* ---------------------------------------------------------------- recipes */

export const generateRecipeRequestSchema = z.object({
  ingredients: z.array(z.string()).min(1),
  preferences: z.unknown().optional(),
  user: agentUserSchema.optional(),
});

/**
 * Structured extraction over an imported recipe.
 *
 * The agent returns validated fields; the API writes them. The agent has no
 * access to the `recipes` table beyond reading it, so persistence is not
 * something it could do even if it wanted to.
 */
export const enrichRecipeRequestSchema = z.object({
  title: z.string(),
  cuisine: z.string().nullish(),
  servings: z.number().int().positive(),
  ingredients: z.array(
    z.object({ name: z.string(), amount: z.number(), unit: z.string() })
  ),
  instructions: z.array(z.object({ step: z.number().int(), instruction: z.string() })),
});

/**
 * Every field here has already been through the agent's plausibility checks —
 * implausible macros, missing notes and out-of-range step numbers are rejected
 * at the source rather than written to the database and noticed on screen.
 */
export const enrichRecipeResponseSchema = z.object({
  prepTime: z.number().int().nonnegative(),
  cookTime: z.number().int().nonnegative(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  nutrition: z.object({
    calories: z.number().nonnegative(),
    protein: z.number().nonnegative(),
    carbs: z.number().nonnegative(),
    fat: z.number().nonnegative(),
    fiber: z.number().nonnegative().optional(),
    sugar: z.number().nonnegative().optional(),
    sodium: z.number().nonnegative().optional(),
  }),
  safetyNote: z.string(),
  zeroWasteNote: z.string(),
  stepTips: z.array(z.object({ step: z.number().int(), tip: z.string() })),
});

/* ------------------------------------------------------------- retrieval */

export const retrieveRequestSchema = z.object({
  query: z.string().optional(),
  pantry: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  dietaryRestrictions: z.array(z.string()).default([]),
  limit: z.number().int().min(1).max(50).default(6),
});

export const retrievedRecipeSchema = z.object({
  id: z.string(),
  title: z.string(),
  imageUrl: z.string().nullable(),
  cuisine: z.string().nullable(),
  totalTime: z.number(),
  servings: z.number(),
  dietaryTags: z.array(z.string()),
  matched: z.array(z.string()),
  missing: z.array(z.string()),
  coverage: z.number(),
  score: z.number(),
  reasons: z.array(z.string()),
});

export const retrieveResponseSchema = z.object({
  recipes: z.array(retrievedRecipeSchema),
});

/* ------------------------------------------------------------ meal plans */

export const generateMealPlanRequestSchema = z.object({
  days: z.number().int().min(1).max(30),
  preferences: z.unknown().optional(),
  context: agentContextSchema.optional(),
  user: agentUserSchema,
});

/* ------------------------------------------------------- tips & nutrition */

export const cookingTipsRequestSchema = z.object({ topic: z.string().min(1) });

export const analyzeNutritionRequestSchema = z.object({
  foodItems: z.array(z.string()).min(1),
});

/* ---------------------------------------------------------------- vision */

/** Mirrors `RecognitionResult` in the agent's vision service. */
export const detectedPantryItemSchema = z.object({
  name: z.string(),
  category: z.string(),
  brand: z.string().optional(),
  estimatedQuantity: z.number().optional(),
  unit: z.string().optional(),
  confidence: z.number(),
  nutritionPer100g: z
    .object({
      calories: z.number().optional(),
      protein: z.number().optional(),
      carbs: z.number().optional(),
      fat: z.number().optional(),
    })
    .optional(),
});

/**
 * The recogniser identifies one subject per image, so this is a single result
 * rather than a list — matching what the pantry scan actually does today.
 */
export const visionResponseSchema = detectedPantryItemSchema;

/* ---------------------------------------------------------------- health */

export const agentHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  uptime: z.number(),
  checks: z.object({
    database: z.enum(['up', 'down']),
    llm: z.enum(['configured', 'missing']),
    embeddings: z.enum(['ready', 'loading', 'unavailable']),
  }),
  recipesIndexed: z.number().optional(),
});

/* ----------------------------------------------------------------- types */

export type ChatRole = z.infer<typeof chatRoleSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type AgentUser = z.infer<typeof agentUserSchema>;
export type AgentContext = z.infer<typeof agentContextSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type ChatResponseType = z.infer<typeof chatResponseTypeSchema>;
export type StreamEvent = z.infer<typeof streamEventSchema>;
export type GenerateRecipeRequest = z.infer<typeof generateRecipeRequestSchema>;
export type EnrichRecipeRequest = z.infer<typeof enrichRecipeRequestSchema>;
export type EnrichRecipeResponse = z.infer<typeof enrichRecipeResponseSchema>;
export type RetrieveRequest = z.infer<typeof retrieveRequestSchema>;
export type RetrievedRecipe = z.infer<typeof retrievedRecipeSchema>;
export type RetrieveResponse = z.infer<typeof retrieveResponseSchema>;
export type GenerateMealPlanRequest = z.infer<typeof generateMealPlanRequestSchema>;
export type CookingTipsRequest = z.infer<typeof cookingTipsRequestSchema>;
export type AnalyzeNutritionRequest = z.infer<typeof analyzeNutritionRequestSchema>;
export type DetectedPantryItem = z.infer<typeof detectedPantryItemSchema>;
export type VisionResponse = z.infer<typeof visionResponseSchema>;

export const visionRequestSchema = z.object({
  /** Base64 image payload, without a data: URI prefix. */
  image: z.string().min(1),
  context: z.string().default('pantry_item'),
});

export type VisionRequest = z.infer<typeof visionRequestSchema>;
export type AgentHealth = z.infer<typeof agentHealthSchema>;
