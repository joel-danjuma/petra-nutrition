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
  /**
   * The reply carries a dish the agent composed rather than one it found.
   * Distinct from `recipe_suggestion` because there is no `recipeId` to open:
   * the payload *is* the recipe until the user saves it.
   */
  'generated_recipe',
]);

/* ------------------------------------------------------- nutrition payload */

/**
 * Macros for one serving.
 *
 * The field set matches `RecipeNutrition` exactly so a saved generation writes
 * straight through with no mapping layer to drift.
 */
export const nutritionFactsSchema = z.object({
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
  fiber: z.number().nonnegative().optional(),
  sugar: z.number().nonnegative().optional(),
  sodium: z.number().nonnegative().optional(),
});

/**
 * Where each number came from.
 *
 * Carried alongside the totals so an unresolved ingredient is *visible* rather
 * than silently folded into a confident-looking figure. `source: 'unresolved'`
 * means the item contributed nothing to the totals, and the UI is expected to
 * say so.
 */
export const nutritionProvenanceSchema = z.object({
  ingredient: z.string(),
  /** Resolved mass in grams, or null when the quantity could not be read. */
  grams: z.number().nonnegative().nullable(),
  /**
   * Where the macros came from.
   *
   * `excluded` is deliberate rather than a failure: pasta water is drained and
   * a discarded poaching liquid is not eaten, so neither belongs in a total.
   * `unresolved` is the honest admission — the item counts for nothing because
   * nothing could be found for it.
   *
   * There is no `model-estimate`, and that is the point: macros are always
   * database rows scaled by arithmetic. A model is asked for at most one thing,
   * the weight of one of a countable item, and when that happens it is recorded
   * in `assumption` rather than by relabelling the macro source.
   */
  source: z.enum(['usda', 'openfoodfacts', 'excluded', 'unresolved']),
  /** The matched database row, for an audit trail. */
  matchedAs: z.string().optional(),
  fdcId: z.number().optional(),
  /**
   * How the mass was arrived at, when it was not simply read off the recipe —
   * "one chicken breast at about 174g", "plain flour at 0.53 g/ml". Present
   * only where something was assumed, so its absence means the number was
   * converted exactly.
   */
  assumption: z.string().optional(),
});

export const nutritionBreakdownSchema = z.object({
  perServing: nutritionFactsSchema,
  servings: z.number().positive(),
  /** 'low' whenever any ingredient fell back to a model estimate. */
  confidence: z.enum(['high', 'medium', 'low']),
  items: z.array(nutritionProvenanceSchema),
});

/* -------------------------------------------------- generated recipe payload */

/**
 * A dish the agent composed. Deliberately the same shape as the enrichment
 * response's neighbours: `amount`/`unit`/`name` ingredients and `step`/
 * `instruction` steps, so `POST /api/recipes/generated` can persist it without
 * reshaping anything.
 *
 * Ephemeral by default. Nothing is written until the user explicitly saves.
 */
export const generatedRecipeSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  cuisine: z.string().nullish(),
  servings: z.number().int().positive(),
  prepTime: z.number().int().nonnegative(),
  cookTime: z.number().int().nonnegative(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  ingredients: z.array(
    z.object({
      name: z.string().min(1),
      amount: z.number().positive(),
      unit: z.string(),
      notes: z.string().optional(),
      /** True for salt/pepper/oil and friends — assumed present, never shopped. */
      staple: z.boolean().optional(),
    })
  ).min(1),
  instructions: z.array(
    z.object({
      step: z.number().int().positive(),
      instruction: z.string().min(1),
      duration: z.number().int().nonnegative().optional(),
      tip: z.string().optional(),
    })
  ).min(1),
  safetyNote: z.string().optional(),
  zeroWasteNote: z.string().optional(),
  /**
   * Recipe ids that seeded this draft, when it came from the merge path. The
   * client renders these as a quiet "inspired by" line, not an attribution
   * block.
   */
  inspiredBy: z.array(z.string()).default([]),
});

/**
 * What a client sends to persist a generation it was shown.
 *
 * Lives in the contract even though it is a client-to-API request, because the
 * payload *is* `generatedRecipe` from a chat response: the client echoes back
 * what it was given rather than rebuilding it, and sharing the schema is what
 * guarantees the two stay the same shape. The nutrition block comes along so
 * the saved recipe keeps the computed macros rather than being re-estimated.
 */
export const saveGeneratedRecipeRequestSchema = z.object({
  recipe: generatedRecipeSchema,
  nutrition: nutritionBreakdownSchema.optional(),
});

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

  /* --- added by the graph. All optional, so the gateway compiles unchanged
     and clients opt in one field at a time. ---------------------------------- */

  /** Present when the agent composed a dish instead of recommending one. */
  generatedRecipe: generatedRecipeSchema.optional(),
  /** Macros for the portion actually suggested, with per-ingredient sources. */
  nutrition: nutritionBreakdownSchema.optional(),
  /**
   * What the agent decided on the user's behalf — "assumed 2 servings from the
   * quantities you have". Stated, never hidden.
   */
  assumptions: z.array(z.string()).default([]),
  /**
   * Where a constraint could not be fully met. Best effort is the policy; this
   * is where the compromise is named plainly.
   */
  compromises: z.array(z.string()).default([]),
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
      /**
       * Which graph thread this turn belongs to — the API's chat session id.
       *
       * The agent keeps ephemeral working state per thread so a turn in
       * progress can be resumed; it is TTL'd and holds no user data beyond
       * what this request already carried. The API still owns the durable
       * transcript. Omitted means a self-contained turn with a random thread,
       * which is what a one-off call should get.
       */
      threadId: z.string().min(1).max(200).optional(),
    })
    .optional(),
});

/* ------------------------------------------------------------ SSE envelope */

/** The graph nodes a client may be told about. */
export const graphNodeSchema = z.enum([
  'router',
  'search',
  'compose_recipe',
  'nutrition',
  'respond',
]);

/**
 * Server-sent event names for `POST /v1/chat/stream`.
 *
 * `error` exists because once the first chunk is out the status line is
 * already 200 — a mid-stream failure cannot be an HTTP error and has to be a
 * frame both ends agree on, or the client hangs forever.
 *
 * `node` frames arrive before any `chunk`. Composing a dish takes long enough
 * that a bare spinner reads as a hang, and "Working out the macros" is the
 * difference between waiting and wondering. They are advisory: a client that
 * ignores them sees exactly the stream it saw before.
 *
 * `interrupt` is the clarifying-question path. The graph pauses, the question
 * goes out, and the turn ends — the client asks it, and the user's answer
 * arrives as the next ordinary message. Nothing is held open server-side.
 */
export const streamEventSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('chunk'), data: z.object({ content: z.string() }) }),
  z.object({ event: z.literal('done'), data: chatResponseSchema }),
  z.object({
    event: z.literal('node'),
    data: z.object({
      node: graphNodeSchema,
      /** Human-readable, present tense — rendered directly. */
      label: z.string(),
    }),
  }),
  z.object({
    event: z.literal('interrupt'),
    data: z.object({
      question: z.string(),
      /** Tappable answers, when the fork is a small closed set. */
      options: z.array(z.string()).default([]),
    }),
  }),
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

/* ----------------------------------------------------------------- index */

/**
 * Rebuild the semantic index, optionally for specific recipes.
 *
 * With no ids this just drops the agent's cached view of what the database can
 * do — cheap, and what a deploy wants after a migration. With ids it embeds
 * those recipes, which is what the API calls after persisting a saved
 * generation: the agent owns the embedding model, so the API cannot do it and
 * asks instead.
 */
export const indexRebuildRequestSchema = z.object({
  recipeIds: z.array(z.string()).max(100).default([]),
});

export const indexRebuildResponseSchema = z.object({
  invalidated: z.boolean(),
  embedded: z.number().int().nonnegative(),
});

/* ------------------------------------------------------------- retrieval */

export const retrieveRequestSchema = z.object({
  query: z.string().optional(),
  pantry: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  dietaryRestrictions: z.array(z.string()).default([]),
  limit: z.number().int().min(1).max(50).default(6),
  /**
   * Also search this user's own recipes, not just the public corpus.
   *
   * Needed because a saved generation is written private — it is a dish
   * composed for one kitchen, and publishing it to the shared library would
   * fill that library with near-duplicates nobody chose to share. Without this
   * the recipe is embedded and then permanently unfindable, which makes saving
   * it pointless.
   *
   * Not a boundary violation: the id arrives in the request like every other
   * fact about the caller, and the agent still cannot query the users table.
   * It matches `recipes.createdById`, a column already in its read model.
   */
  ownerId: z.string().optional(),
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
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type NutritionFacts = z.infer<typeof nutritionFactsSchema>;
export type NutritionProvenance = z.infer<typeof nutritionProvenanceSchema>;
export type NutritionBreakdown = z.infer<typeof nutritionBreakdownSchema>;
export type GeneratedRecipe = z.infer<typeof generatedRecipeSchema>;
export type IndexRebuildRequest = z.infer<typeof indexRebuildRequestSchema>;
export type IndexRebuildResponse = z.infer<typeof indexRebuildResponseSchema>;
export type SaveGeneratedRecipeRequest = z.infer<typeof saveGeneratedRecipeRequestSchema>;
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
