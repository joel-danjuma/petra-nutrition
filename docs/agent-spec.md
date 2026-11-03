# Agent service specification

What `services/agent` does, endpoint by endpoint, written from the code at
commit `970ed98`. The wire contract it implements is `packages/agent-contract`.
Every claim cites `path:line-range` so it can be checked, and re-checked after
the code moves.

Anything that looks like a bug, a safety gap or drift between code and its own
documentation is collected under [Known issues](#14-known-issues) at the end,
rather than mixed into the description. Where a section mentions one, it links
there as **(KI-n)**.

Contents

1. [Topology](#1-topology)
2. [Transport, auth and envelopes](#2-transport-auth-and-envelopes)
3. [Endpoints](#3-endpoints)
4. [The chat graph](#4-the-chat-graph)
5. [Retrieval scoring](#5-retrieval-scoring)
6. [Allergen and diet filtering](#6-allergen-and-diet-filtering)
7. [Model routing](#7-model-routing)
8. [Streaming and the safe-prefix logic](#8-streaming-and-the-safe-prefix-logic)
9. [Error handling](#9-error-handling)
10. [Timeouts](#10-timeouts)
11. [Caching and TTLs](#11-caching-and-ttls)
12. [Environment variables](#12-environment-variables)
13. [External calls](#13-external-calls)
14. [Known issues](#14-known-issues)

---

## 1. Topology

- An Express service on port `3002`, reachable only from the API over the
  private network (`services/agent/src/index.ts:14-23`).
- It holds the model keys (Groq, Gemini) and the USDA key. It holds no JWT,
  SMTP or Stripe secrets (`services/agent/src/config/index.ts:5-12`).
- Its database client is generated from a projection of the API schema. It
  covers `Recipe`, `RecipeIngredient`, `RecipeInstruction` and
  `RecipeEmbedding` only (`services/agent/prisma/schema.prisma:29-133`,
  `services/agent/src/db/index.ts:6-19`).
- At boot it verifies the read model (the columns it reads, plus
  `vector_dims` equal to 384) and refuses to start on a mismatch
  (`services/agent/src/db/index.ts:29-94`).
- User identity, allergies, pantry and history all arrive in the request body.
  The only state it keeps is graph working memory in Redis, with a TTL (§11),
  plus the embedding table.

Boot sequence (`services/agent/src/index.ts:24-137`):

1. `validateConfig()` throws if any of these is missing: `DATABASE_URL`,
   `GROQ_API_KEY`, or `INTERNAL_API_KEY` in production. It also requires a
   `postgresql://` URL (`config/index.ts:95-114`).
2. Log the non-fatal warnings: no `REDIS_URL`, no `FDC_API_KEY`
   (`config/index.ts:127-147`).
3. `connectDatabase()` runs the read-model probe and returns the public recipe
   count used by `/health`.
4. Middleware, routes, and the 404 and error handlers.
5. `listen`. After that, `warmUp()` loads the embedding model in the
   background. A failure here is only logged (`index.ts:108-110`).
6. Any `uncaughtException` or `unhandledRejection` exits the process
   (`index.ts:124-132`).

## 2. Transport, auth and envelopes

### Middleware (in order)

| Layer | Behaviour | Ref |
|---|---|---|
| `trust proxy` | `1` | `index.ts:38` |
| `helmet()` | defaults | `index.ts:39` |
| `compression` | level 6, threshold 1 KB. **Skipped** for `/v1/chat/stream` and for any request with an `x-no-compression` header, because buffering would defeat SSE | `index.ts:44-54` |
| `express.json` | 16 MB limit, sized for a base64 photo at the API's 10 MB cap | `index.ts:57-59` |
| request log | logs on `finish` with duration | `index.ts:61-65` |
| `internalAuth` | applied to every `/v1/*` route, not to `/health` | `routes/index.ts:40,157` |

### Authentication: `internalAuth`

`services/agent/src/middleware/internal-auth.ts:19-44`

- The header is `x-internal-key` (`agent-contract/src/index.ts:16`).
- If `NODE_ENV !== 'production'` **and** `INTERNAL_API_KEY` is empty, every
  call passes (`:23`) **(KI-15)**.
- Otherwise the header must equal `INTERNAL_API_KEY` under `!==`, a plain
  string comparison that is not constant-time (`:25-27`) **(KI-15)**.
- On a mismatch: log a warning with path and IP, then respond
  `401 { success:false, error:{ code:'INTERNAL_AUTH_FAILED', message, timestamp } }`.
- No JWT is verified. `user.id` and `user.subscriptionTier` in the body are
  trusted as asserted by the gateway (`agent-contract/src/index.ts:27-35`).

### Envelopes

- **Success** (every JSON route): `{ success: true, data: <payload> }`.
- **Validation failure**: `parse()` runs `safeParse` against the contract
  schema. On failure it throws `ValidationError('Invalid agent request body',
  error.flatten())`, which becomes `400 VALIDATION_ERROR` with `details`
  (`routes/index.ts:29-35`). `/chat/stream` builds the same 400 inline, before
  any SSE headers (`routes/stream.ts:45-58`).
- **Other errors** go through `createErrorHandler` from `@petra/service-kit`
  (`packages/service-kit/src/errors.ts:197-277`). A `CustomError` keeps its
  status, code and message. Prisma errors are mapped. **Any plain `Error`
  becomes `500 INTERNAL_ERROR "Internal server error"`.** Body:
  `{ success:false, error:{ code, message, timestamp, path, requestId?, details? } }`,
  plus `stack` when `NODE_ENV=development`.
- **Unknown route**: `404 RESOURCE_NOT_FOUND`
  (`service-kit/src/errors.ts:287-297`).

## 3. Endpoints

All `/v1/*` routes are `POST` and authenticated (§2). Schemas are summarised as
TypeScript. The Zod source is authoritative. `?` means optional, and `= x`
means a Zod default.

### 3.1 `GET /health` (unauthenticated)

`services/agent/src/index.ts:69-82`

```ts
{ status: 'healthy', service: 'agent', uptime: number,
  checks: { database: 'up', llm: 'configured'|'missing', vision: 'configured'|'missing' },
  recipesIndexed: number,   // public recipe count, captured once at boot
  timestamp: string }
```

`status` and `checks.database` are hard-coded literals. No dependency is
probed per request. The shape does not match the contract's
`agentHealthSchema` (`agent-contract/src/index.ts:441-450`) **(KI-33)**.

### 3.2 `POST /v1/chat`

Route `routes/index.ts:42-63`. Orchestrator `orchestrator.ts:63-99`.

Request: `chatRequestSchema` (`agent-contract/src/index.ts:235-254`)

```ts
{
  messages: { role: 'system'|'user'|'assistant'; content: string }[]  // min 1
  user: { id: string; subscriptionTier: 'FREE'|'PREMIUM' = 'FREE' }
  context?: {                                  // agentContextSchema :42-62
    userPreferences?: unknown                  // only cuisinePreferences / cookingSkillLevel are read
    currentPantryItems: string[] = []
    pantryNames: string[] = []                 // preferred over currentPantryItems for matching
    dietaryRestrictions: string[] = []
    healthGoals: string[] = []
    allergies: string[] = []
    activeMealPlan?: string                    // only its presence is used
    lastRecipeSearch?: string                  // passed to the prompt context, otherwise unused
    profileUnavailable?: boolean
  }
  options?: {
    maxRetrieved?: number                      // int 0..20, default 6 in the search node
    threadId?: string                          // 1..200 chars; the API sends its chat session id
  }
}
```

Response: `{ success: true, data: ChatResponse }`, where `chatResponseSchema`
(`agent-contract/src/index.ts:202-231`) is:

```ts
{
  content: string
  type: 'text'|'recipe_suggestion'|'meal_plan_suggestion'|'pantry_update'
      |'shopping_list_generation'|'generated_recipe'
  structuredData?: unknown          // regex-derived hints, see §4.8
  suggestions?: string[]
  recipeId?: string                 // only ever an id from this turn's shortlist
  confidence?: number               // 0.8 from respond, 1 from clarify
  model?: string
  tokensUsed?: number               // (KI-21)
  generatedRecipe?: GeneratedRecipe // :152-186
  nutrition?: NutritionBreakdown    // :134-140
  assumptions: string[] = []
  compromises: string[] = []
}
```

Behaviour:

1. Thread id = `options.threadId`, or `turn-<uuid>` when absent
   (`orchestrator.ts:46-47`).
2. Invoke the compiled graph with `{ messages, context, options, userMessage,
   userId }`, `recursionLimit: 12` and the thread id
   (`orchestrator.ts:68-77`, `graph/index.ts:138`). The whole graph is §4.
3. If the final state has no `response`, throw `Error('AI service is currently
   unavailable')`, which surfaces as a 500 (`orchestrator.ts:79-85`)
   **(KI-27)**.
4. Log the user id, model, tokens, recipe id and duration
   (`routes/index.ts:53-59`).

There is no abort signal on this route. A client disconnect or API timeout
does not stop the graph **(KI-19)**. A provider rate-limit message reaches the
caller only as a generic 500 **(KI-18)**.

### 3.3 `POST /v1/chat/stream`

`services/agent/src/routes/stream.ts:44-139`

Request: same as §3.2.

Response: `200 text/event-stream`. Headers are `Cache-Control: no-cache,
no-transform`, `Connection: keep-alive` and `X-Accel-Buffering: no`, sent
immediately with `flushHeaders()` (`:62-68`). Frames are written only through
`encodeFrame` (`agent-contract/src/frames.ts:39-41`). Events, per
`streamEventSchema` (`agent-contract/src/index.ts:283-306`):

| event | data | When |
|---|---|---|
| `node` | `{ node: 'router'\|'search'\|'compose_recipe'\|'nutrition'\|'respond', label }` | Each node that calls `emitNode`, before any chunk. `respond` and `clarify` emit none. Labels are in `graph/turn-context.ts:48-54` |
| `chunk` | `{ content }` | Sanitised text deltas from `respond`, or the clarifying question (§8) |
| `interrupt` | `{ question, options[] }` | The clarify path only, followed by the same question as a `chunk` (`graph/nodes/clarify.ts:41-44`) |
| `done` | `ChatResponse` | Exactly once on success (`:109`) |
| `error` | `{ code:'AGENT_STREAM_FAILED', message }` | Graph threw and the client is still connected (`:127-134`) |
| `: ping` | comment | Every 15 s (`:15,71-74`, `frames.ts:30`) |

Disconnect handling: `res.on('close')`, deliberately not `req.on('close')`
(`:80-92`), aborts an `AbortController` when the response hasn't ended. The
signal is threaded to the graph invoke and to every model call through
async-local storage (`orchestrator.ts:74`, `graph/turn-context.ts:78`). After
an abort the catch block just ends the response (`:120-125`).

### 3.4 `POST /v1/recipes/retrieve`

Route `routes/index.ts:67-77`. Service `retrieval/index.ts:119-164`.

Request: `retrieveRequestSchema` (`agent-contract/src/index.ts:372-392`)

```ts
{ query?: string; pantry: string[] = []; allergies: string[] = [];
  dietaryRestrictions: string[] = []; limit: number = 6 /* int 1..50 */; ownerId?: string }
```

Response: `{ success: true, data: { recipes: RetrievedRecipe[] } }`

```ts
RetrievedRecipe = { id; title; imageUrl: string|null; cuisine: string|null;
  totalTime: number; servings: number; dietaryTags: string[];
  matched: string[]; missing: string[]; coverage: number; score: number;
  reasons: ('pantry'|'lexical'|'semantic'|'diet')[] }
```

Behaviour is §5 in full. A SQL error in one signal drops that signal. An error
in the capability probe or in hydration propagates as a 500.

### 3.5 `POST /v1/recipes/enrich`

Route `routes/index.ts:83-92`. Logic `llm/enrich.ts:178-206`.

Request: `enrichRecipeRequestSchema` (`agent-contract/src/index.ts:317-325`)

```ts
{ title: string; cuisine?: string|null; servings: number /* int > 0 */;
  ingredients: { name: string; amount: number; unit: string }[];
  instructions: { step: number; instruction: string }[] }
```

Response: `enrichRecipeResponseSchema` (`:332-348`)

```ts
{ prepTime: int>=0; cookTime: int>=0; difficulty: 'EASY'|'MEDIUM'|'HARD';
  nutrition: { calories; protein; carbs; fat; fiber?; sugar?; sodium? };
  safetyNote: string; zeroWasteNote: string; stepTips: { step: int; tip: string }[] }
```

Behaviour:

1. One `modelFor('enrich')` call: fast model, JSON mode, temperature 0.3,
   2000 tokens. No abort signal (`enrich.ts:195-198`).
2. `parseJson` strips any code fence and takes the first `{` to the last `}`
   (`enrich.ts:41-49`).
3. `validateEnrichment` throws on any of these (`enrich.ts:55-113`): missing
   times; prep over 480 or cook over 1440; a bad difficulty; a missing macro;
   macros above `3000 kcal / 300 g protein / 500 g carbs / 300 g fat`; either
   note under 15 characters. Step tips must have an integer step in
   `1..stepCount` and more than 10 characters, and at most 3 are kept.
4. `reconcileNutrition` runs `analyse()` (§4.7) on the same ingredients. The
   computed per-serving macros replace the model's figures unless the computed
   confidence is `low`. A thrown error also keeps the model figures
   (`enrich.ts:131-165`) **(KI-34)**.

A validation throw is a plain `Error`, so the caller gets a 500.

### 3.6 `POST /v1/vision/pantry-items`

Route `routes/index.ts:105-115`. Service `vision/index.ts:33-99`.

Request: `visionRequestSchema` (`agent-contract/src/index.ts:478-482`):
`{ image: string /* base64, min 1 */; context: string = 'pantry_item' }`.

Response: `detectedPantryItemSchema` (`:416-431`)

```ts
{ name; category; brand?; estimatedQuantity?; unit?; confidence: number;
  nutritionPer100g?: { calories?; protein?; carbs?; fat? } }
```

Behaviour:

- Throw if `GEMINI_API_KEY` is unset.
- Strip any `data:image/...;base64,` prefix.
- POST to `gemini-pro-vision:generateContent` with `?key=` in the URL **(KI-13)
  (KI-29)**. `mime_type` is always `image/jpeg`. Settings: temperature 0.1,
  topK 32, topP 1, 1024 output tokens, 30 s timeout.
- The prompt (`:158-192`) asks for one item as JSON. `context` values
  `fresh_produce` and `packaged_food` append a focus line. Any other value gets
  the base prompt.
- `parseGeminiResponse` takes the first `{…}`, requires `name` and `category`,
  and clamps `confidence` to 0..1 with a default of 0.5. If parsing fails it
  returns `{ name:'Unknown Food Item', category:'other', confidence:0.1 }` with
  a 200 **(KI-30)**. The result is not validated against the contract
  **(KI-31)**.
- Errors: a 429 becomes "temporarily unavailable due to rate limits", a 403
  becomes "access denied", anything else "Failed to recognize image content".
  All three are plain `Error`s, so the caller gets a 500.

### 3.7 `POST /v1/vision/receipt`

Route `routes/index.ts:94-103`. Service `vision/index.ts:106-139`. Parser
`vision/receipt.ts:77-135`.

Request: `{ image: string }` (`agent-contract/src/index.ts:495-498`).

Response:
`{ items: { name; category; brand?; quantity?; unit?; expiresInDays? /* int 0..3650 */; confidence /* 0..1 */ }[]; store? }`
(`:500-518`).

Behaviour:

- Same Gemini transport as §3.6, with `RECEIPT_PROMPT` (`receipt.ts:17-38`),
  4096 output tokens and a 30 s timeout.
- `parseReceipt` takes the first `{…}` and keeps at most 80 lines. For each
  line it:
  - normalises nulls;
  - maps `category` onto the closed set, with `other` as the fallback;
  - rounds `expiresInDays`;
  - defaults `confidence` to 0.5;
  - validates against `receiptItemSchema`;
  - drops confidence under 0.4;
  - drops names matching the `NOT_FOOD` regex (`:41-42`);
  - dedupes by lower-cased name, keeping the first (`:123-126`) **(KI-38)**.
- If there is no JSON at all, it returns `{ items: [] }` with a 200.

### 3.8 `POST /v1/index/rebuild`

`routes/index.ts:131-155`, `retrieval/store.ts:41-77`

Request: `{ recipeIds: string[] = [] /* max 100 */ }`
(`agent-contract/src/index.ts:361-363`). An empty body is allowed.

Response: `{ invalidated: true, embedded: number }`.

Behaviour:

1. `retrievalService.invalidate()` clears the cached capability probe (§5.4).
2. If ids were given, `embedRecipesByIds` does the rest:
   - loads title, description, cuisine, tags, ingredient names and the first
     two instructions;
   - builds the text with `recipeEmbeddingText` (`embedding.ts:86-107`);
   - embeds in batches of 32;
   - upserts each 384-dimension vector with `model =
     'Xenova/all-MiniLM-L6-v2'` (`store.ts:20-32`).
3. Embedding errors are logged and swallowed, so the endpoint still returns
   200 with `embedded: 0`.

The same write path is used by `pnpm --filter @petra/agent run embed`
(`scripts/embed-recipes.ts`). That script pages 500 at a time and skips rows
already embedded with the current model unless `--force` is passed.

## 4. The chat graph

### 4.1 Topology

`services/agent/src/graph/index.ts:48-104`

```
START → router ─┬─ clarification set      → clarify → END
                ├─ intent = chat          → respond → END
                └─ otherwise              → search ─┬─ intent = nutrition                → nutrition → respond
                                                    ├─ intent = search & sufficient      → respond
                                                    └─ otherwise                         → compose_recipe
compose_recipe ─┬─ draft set                 → nutrition → respond
                ├─ composeAttempts < 2       → compose_recipe   (one retry)
                └─ otherwise                 → respond          (degraded)
```

The graph is compiled once, lazily, with the checkpointer from §11
(`graph/index.ts:116-122`). `RECURSION_LIMIT = 12`, against a longest
legitimate path of 6 steps (`:129-138`).

### 4.2 State and the per-turn reset

Channels are in `graph/state.ts:63-172`. Most are overwrite-on-write (`last`,
`:42-43`). The exceptions:

| Channel | Reducer | Ref |
|---|---|---|
| `assumptions`, `compromises` | overwrite with a de-duplicated copy of the update | `:54-61` |
| `composeAttempts` | `update === 0 ? 0 : current + update` (0 is the reset sentinel) | `:134-137` |
| `tokensUsed` | `current + update`, **never reset** | `:168-171` **(KI-21)** |

State is checkpointed per thread, and a thread is a whole chat session. The
router therefore resets these channels at the start of every turn
(`router.ts:278-292`):

- `draft = null`
- `retrieved = []`
- `retrievalSufficient = false`
- `overflow = []`
- `macros = null`
- `failures = []`
- `assumptions = []`
- `compromises = []`
- `composeAttempts = 0`
- `maxMinutes = null`

`response`, `model`, `tokensUsed`, `clarification` and `servings` are not in
that set. The router's normal paths overwrite `clarification` and `servings`,
but the empty-message path does not **(KI-26)**.

Constraints are derived from state on demand, never stored, because state must
survive JSON (`state.ts:15-28,183-184`). Callbacks and the abort signal live in
`AsyncLocalStorage` (`graph/turn-context.ts`).

### 4.3 `router`

`services/agent/src/graph/nodes/router.ts:303-393`

1. Emit a `node` frame. If there is no user message, return
   `{ intent:'chat', ...reset }` (`:307`).
2. `previousIntent` = the intent left in state by the previous turn (`:311`).
3. Call `modelFor('router')`. The system prompt is `PROMPT` (`:28-50`) plus
   three additions:
   - the previous intent;
   - a REFINEMENT rule;
   - the last 4 non-system messages, each cut to 200 characters
     (`recentTurns`, `:295-301`).

   The user message is the raw text.
4. `parseRouterOutput` (`:230-267`) builds the result:
   - `intent` must be one of the four values.
   - `ingredients`: strings of 2 to 59 characters, at most 12.
   - `servings`: an integer from 1 to 12, otherwise null.
   - `clarify` is kept only when `question` is more than 8 characters;
     `options` are capped at 4.
   - Anything invalid throws, and the fallback (step 7) takes over.
5. **Refinement carry-over** (`:338-349`). The turn is treated as a refinement
   when all three hold:
   - the model said `chat`;
   - the previous intent was `search` or `compose`;
   - `isRefinement(message)` is true.

   The intent is then the previous one. If the model extracted no ingredients,
   the previous turn's `namedIngredients` are kept. `isRefinement`
   (`:165-181`) requires all of these:
   - at most 8 words and at most 48 characters;
   - no technique-question shape (`TECHNIQUE_SHAPE`, `:160-161`);
   - no nutrition words (`NUTRITION_PHRASES`, `:67`);
   - either a `REFINEMENT_CONSTRAINT` match (`:156-157`) or a negated food
     word (`NEGATED_FOOD`, `:163`).
6. `maxMinutes` comes from `parseMaxMinutes` (`:191-209`), never from the
   model:
   - "half an hour" gives 30;
   - an `N min|minute(s)|hr(s)|hour(s)` pattern gives N, times 60 for hours,
     accepted only within 5..480;
   - "an hour" gives 60;
   - anything else gives null.
7. **Fallback** when the model call fails or validation throws
   (`:369-392`):
   - The intent comes from `heuristicIntent` (`:215-227`), checked in this
     order:
     1. a nutrition word gives `nutrition`;
     2. compose words plus a with-ingredients phrase give `compose`;
     3. search words give `search`;
     4. compose words alone give `compose`;
     5. a refinement after `search` or `compose` gives the previous intent;
     6. anything else is `chat`.
   - Ingredients come from `heuristicIngredients` (`:85-142`). It reads each
     comma- or "and"-separated fragment right to left, keeping the trailing run
     of `FOOD_TOKENS` and `DESCRIPTORS`, and keeps at most 12.
   - `servings` and `clarification` are set to null.

### 4.4 `clarify`

`services/agent/src/graph/nodes/clarify.ts:27-58`

This is not a LangGraph `interrupt()`, so nothing is parked on the server. The
node:

1. emits `interrupt(question, options)`;
2. emits the question as a `chunk`;
3. returns `{ response: { content: question, type:'text', suggestions: options,
   confidence: 1, assumptions: [], compromises: [], model, tokensUsed } }`.

The user's answer arrives as the next ordinary turn.

### 4.5 `search`

`services/agent/src/graph/nodes/search.ts:64-156`

1. `pantry` = `context.pantryNames` if that list is non-empty, otherwise
   `currentPantryItems`.
2. Call `retrievalService.search` (§5) with:
   - `query`: the raw user message;
   - `pantry`: the named ingredients when any were extracted, otherwise the
     pantry;
   - `allergies` and `dietaryRestrictions` from the context;
   - `limit`: `options.maxRetrieved`, default 6;
   - `ownerId`: the user id.
3. A hit is **fitting** when all three hold (`:103-108`):
   - `coversNamed`: every named ingredient is covered (`covers` from
     `@petra/food-measures`) by some matched or missing ingredient, or by the
     title (`:37-42`).
   - `withinTime`: there is no limit, or `0 < totalTime <= maxMinutes`. An
     untimed recipe (0) never satisfies a limit (`:94-95`).
   - If the question is **pantry-led** (no named ingredients and a non-empty
     pantry), `coverage >= 0.5` or `missing.length <= 2` (`:57-62,101`).
4. `retrievalSufficient` = at least one fitting hit.
   `retrieved` = the fitting hits when sufficient, otherwise **all** hits
   (`:136`).
5. `timedOut`: not sufficient, a limit was set, and some hit did cover the
   named ingredients. In that case a compromise is recorded saying nothing in
   the library fits the time limit (`:114-117,139-146`).
6. **Overflow**: only when not sufficient **and** there are fewer than 3 hits.
   It calls `overflowSeeds(userMessage)` (§13) (`:121`) **(KI-16)**.
7. Any exception returns `{ retrieved:[], retrievalSufficient:false,
   overflow:[] }`, and the turn continues ungrounded (`:148-155`).

### 4.6 `compose_recipe` and validation

`services/agent/src/graph/nodes/compose-recipe.ts:154-236`

**Constraints** (`graph/constraints.ts:90-128`):

- `blockedTokens` = the union of `expandAllergen(allergy)` and
  `expandDiet(diet)` (§6).
- `pantry` = `pantryNames`, or `currentPantryItems` when that is empty.
- `allowed` = `dedupe([...named, ...pantry, ...STAPLES])`, minus any name with
  a token in `blockedTokens`. Diet terms are blocked here too, named
  ingredients included **(KI-35)**.
- `allowedTokens` = the union of `normalise()` over `allowed`.

**Prompt.** The system prompt is `PROMPT` (`:46-69`), JSON-only, with five hard
rules. The user message has four parts:

1. `The user said: "<raw message>"`.
2. `constraintBlock` (`:72-120`), in order:
   - NAMED, minus staples, and **not filtered by the blocked set** **(KI-9)**;
   - ALSO IN THEIR KITCHEN: pantry items that are allowed and not named,
     at most 40;
   - STAPLES: those still allowed;
   - EXCLUDED: the declared strings plus the sorted `blockedTokens`;
   - SERVINGS: the stated number, or "choose what the quantities make".
3. `seedBlock` (`:123-152`): the top 3 `retrieved` and the top 3 `overflow`
   recipes, each with title, cuisine and up to 8 ingredients.
4. On a retry, the previous failures, safety failures first (`:163-169`,
   `validate.ts:320-323`).

**Model.** `modelFor('compose')`: the smart model, falling back to the fast
one on a rate limit (§7).

**Validation.** `validateGeneratedRecipe` (`graph/validate.ts:69-287`) uses
"reject, don't repair". The first failing rule per ingredient wins:

| Rule | Check | Ref |
|---|---|---|
| malformed | Not an object; title under 3 characters; empty ingredients; nameless ingredient | `:76-103` |
| blocked-ingredient (safety) | Any token of the ingredient **name** in `blockedTokens` | `:107-117` |
| out-of-set-ingredient | Name tokens, minus `DESCRIPTORS`, must all be in `allowedTokens`. All-descriptor names fail | `:119-128`, `constraints.ts:150-156` |
| bad-quantity | `amount` must be a finite number above 0 | `:132-139` |
| bad-steps | Each `instruction` at least 10 characters; at least 2 steps | `:155-179` |
| blocked-ingredient (safety) | Any token of the joined **instruction text** in `blockedTokens` | `:190-213` |
| phantom-ingredient | A `FOOD_TOKENS` word in the method that is not licensed by the ingredient names (plus `CATEGORY_ALIASES`) and not a staple word | `:195-222` |
| unused-ingredient | A non-staple ingredient with no token in the method | `:226-242` |
| bad-yield | `servings` an integer 1..12; prep at most 480; cook at most 1440 | `:247-259` |

Title, description, ingredient `notes`, `unit`, step `tip`, `safetyNote` and
`zeroWasteNote` are **not** checked against `blockedTokens` **(KI-6)**. An
invalid difficulty silently becomes `MEDIUM` (`:261-264`).

**Outcome:**

- **Pass**: `draft` is set and `inspiredBy` = the ids of the top 3 `retrieved`
  (`:209`). `assumptionsFor` (`:245-276`) adds lines for:
  - the serving count, when it was inferred;
  - staples assumed present;
  - "Inspired by <top retrieved title>";
  - named ingredients left out, matched on the first word of each.
- **Fail**: `draft=null`, `failures` set, `composeAttempts += 1`. If the model
  call throws, the error message becomes the failure text fed to the retry
  (`:220-235`).
- `MAX_ATTEMPTS = 2` (`:32`). After two failures the turn goes to `respond`
  with no draft.

### 4.7 `nutrition`

Node `graph/nodes/nutrition.ts:25-88`. Engine `nutrition/index.ts:204-307`.
Lookups `nutrition/foods.ts`.

**Input.** The draft if there is one. Otherwise `fromLibrary`: a database read
of `retrieved[0]`'s servings and ordered ingredients (`:97-123`) **(KI-1)**.
With neither, the node adds the compromise "No macro breakdown — there is no
specific dish to measure yet."

`analyse()` works in three steps.

1. **Quantity** (`resolveQuantities`, `nutrition/index.ts:132-200`):
   - `toGrams(name, amount, unit)` from `@petra/food-measures` converts each
     line.
   - Lines still unresolved, with `amount > 0` and no `unitWeightFor` entry,
     go to **one** batched `modelFor('nutrition')` call (`WEIGHT_PROMPT`,
     `:107-114`) that asks only for `gramsEach`.
   - A model answer is accepted if it is finite and in `(0, 2000]`. It is then
     marked `fromModel` with the assumption "one X estimated at about Ng".
   - If that call fails, those lines stay unresolved.
2. **Food**, per ingredient, sequentially (`:218-275`):
   - `isNotEaten(name)` matches plain water with an optional
     cold/hot/boiling/warm/filtered/tap prefix (`foods.ts:153`). Such a line
     is `excluded` **(KI-24)**.
   - No grams: the line is `unresolved`.
   - `stapleMacros(name)` checks the local USDA reference table first, for 32
     staples (`foods.ts:107-140,172-199`). It tries an exact key, then the key
     without form words, then a multi-word staple suffix. One-word staples are
     never matched as a suffix, so "peanut butter" is not butter.
   - Otherwise `UsdaFoodDatabase.lookup` (`foods.ts:267-284`):
     - Cache key: `nutrition:food:<normaliseFoodKey(name)>`, hits kept 24 h
       and misses 1 h.
     - FoodData Central first, only if `FDC_API_KEY` is set. It asks for
       `dataType = Foundation, SR Legacy, Survey (FNDDS)` with
       `pageSize = 10`, ranks Foundation, then SR Legacy, then the rest, and
       takes the first row with all four macros (`foods.ts:286-317`).
     - Then Open Food Facts search by name, `page_size = 5`, taking the first
       product with all four `_100g` macros. Sodium is converted from g to mg
       (`foods.ts:326-382`).
     - Errors return `null`, which is then negative-cached **(KI-23)**.
3. **Sum**: `scaleMacros` is `per100g × grams / 100`. The total is divided by
   `max(1, round(servings))`. Calories and sodium are rounded to whole numbers,
   the rest to 1 dp (`:72-83,288-296`).

`confidence` is `low` if anything is unresolved, else `medium` if any weight
came from the model, else `high` (`:285-286`).

Back in the node:

- `validateNutrition` rejects a missing macro, or one above
  `3000 kcal / 300 g protein / 500 g carbs / 300 g fat` per serving
  (`validate.ts:60,299-317`). On a failure the macros are withheld with a
  compromise.
- Unresolved items produce a compromise naming them.
- Earlier compromises are carried forward explicitly, because that channel is
  overwrite-on-write (`nutrition.ts:31`).
- Any throw becomes the compromise "the lookup failed".

### 4.8 `respond`

`services/agent/src/graph/nodes/respond.ts:174-278`

**Prompt messages, in order:**

1. `buildSystemPrompt(context, { brevity:'terse' })` (`chat-prompt.ts:41-158`).
   It contains the house voice and no-markdown rules. When present, it adds
   the pantry, dietary restrictions, health goals, cuisine preferences, skill
   level, **ALLERGIES** (worded more firmly), an active-meal-plan note, and the
   grounding block.
2. Every message in `state.messages`, unmodified, including any `system`
   messages the caller sent.
3. A system **briefing** (`turnBriefing`, `:93-172`) with up to five parts:
   - a summary of the draft plus "name nothing not on this list, do not
     refuse";
   - the macros, with a health-goal remark allowed;
   - assumptions;
   - compromises;
   - for a `compose` or `search` turn with neither a draft nor candidates,
     "say you have no recipe; do not invent one in prose".

The grounding block appears only when there is no draft and `retrieved` is
non-empty (`:62-71`). It lists `[id] "title" (cuisine) N min | already have … |
needs …` and instructs: recommend ONE, by exact title, and end with
`[recipe:<id>]` (`chat-prompt.ts:127-155`).

**Model.** `modelFor('respond')`: fast, temperature 0.7, 3000 tokens, no JSON.
The node uses `stream()` when the turn has an `onChunk` callback and
`complete()` otherwise (§8).

**Parsing** (`parseResponse`, `chat-prompt.ts:295-365`):

- `stripMarkdown`, then `extractRecipeRef`. That function tries three
  strategies in order: the `[recipe:id]` marker, accepted only if the
  lower-cased id is in the candidate list; the longest candidate title
  (at least 6 characters) found as a substring; a fuzzy title-token match with
  at least 0.6 coverage, at least 2 tokens and a margin of 0.15 over the
  runner-up (`:178-230`).
- `type` comes from keyword sniffing:
  - `recipe` → `recipe_suggestion`, else
  - `meal plan` → `meal_plan_suggestion`, else
  - `pantry` / `storage` / `expir` → `pantry_update`, else
  - `shopping` / `grocery` → `shopping_list_generation`.
- `suggestions` come from regexes such as "would you like me to…?",
  "consider…".
- `confidence` is always 0.8.

**Card fallback** (`:233-248`). All of these must hold:

- no `recipeId` was resolved;
- there is no draft;
- `retrievalSufficient` is true **or** the intent is `compose`/`search`;
- the shortlist is non-empty.

Then `recipeId` is set to `shortlist[0].id` and `type` to
`recipe_suggestion`, and the node logs a warning **(KI-8)**.

**Envelope** (`:250-261`):

- `type` is `generated_recipe` when there is a draft.
- `generatedRecipe` is the draft, and then `recipeId` is cleared.
- `nutrition` is the macros.
- `assumptions` and `compromises` are added. Compromises get the
  `PROFILE_UNAVAILABLE_COMPROMISE` line when `context.profileUnavailable` is
  set (`:34-36,48-52`).
- `tokensUsed` = this call's tokens + `state.tokensUsed`.

A model failure is rethrown, which fails the turn.

## 5. Retrieval scoring

`services/agent/src/retrieval/index.ts`, `services/agent/src/retrieval/sql.ts`

### 5.1 Filter construction

```
blockedTerms = allergies.flatMap(expandAllergen) ++ dietaryRestrictions.flatMap(expandDiet)
blocked      = sqlTermPattern(blockedTerms)   // '\y(term|terms|…)\y', or null
```

(`retrieval/index.ts:129-133`, `food-measures/src/ingredients.ts:332-342`.)
`sqlTermPattern` expands each term to its synonym group (§6.1) and to the
plural forms of the term's **last word**. It escapes regex metacharacters.

### 5.2 Candidate signals

There are three, run in parallel with `Promise.all` (`retrieval/index.ts:186-210`).
Each returns at most `CANDIDATES = 60` ids with a 0-based rank
(`sql.ts:32`). Every query includes two clauses:

- **Visibility**: `isPublic = true`, or `createdById = ownerId` when an owner
  id is given (`sql.ts:67-70`).
- **Safety**: when `blocked` is not null, `r.title !~* blocked` **and** no
  ingredient `name ~* blocked` (`sql.ts:79-87`). Description, instructions and
  ingredient `notes` are not checked **(KI-7)**.

| Signal | Runs when | Ranking | Ref |
|---|---|---|---|
| **pantry** | `pantry` non-empty | One `ingredientTerms` list per pantry item. An ingredient is covered if every term of some item matches as a whole word. Rank by `covered distinct names / distinct names` desc, then `rating` desc. Requires at least 1 covered ingredient | `sql.ts:104-142` |
| **lexical** | `query` has at least 2 characters and `pg_trgm` is installed | Filter: `title %> query` or some `ingredient.name %> query` (trigram word-similarity threshold). Score = `max(similarity(title,q)×2, max similarity(ingredient,q), similarity(cuisine,q)×0.5)`, then rating | `sql.ts:151-185` |
| **semantic** | `query` set, `vector` installed, at least 1 embedding with the current model | `embed(query)` (MiniLM, L2-normalised). Order by `embedding <=> query::vector` (cosine distance, HNSW). Only rows with `model = 'Xenova/all-MiniLM-L6-v2'` | `sql.ts:199-223`, `embedding.ts:47-51` |

A signal that throws is logged and contributes nothing (`retrieval/index.ts:188-209`).

### 5.3 Fusion and shaping

Reciprocal Rank Fusion (`retrieval/index.ts:86-88,212-236`):

```
score(id) = Σ_signal  WEIGHT[signal] / (60 + rank_signal(id))
WEIGHT    = { pantry: 1.0, lexical: 0.8, semantic: 0.6 }
```

`rank` is 0-based, so the best possible score from one signal is `w/60`. Each
signal that returned the id appends its name to `reasons`.

Then (`retrieval/index.ts:151-163,247-283`):

1. **Diet fallback.** If the fused list is empty **and** there are dietary
   restrictions, recompute with the allergen-only pattern. This is logged at
   warn level but not surfaced to the user (`:141-149`) **(KI-3)**.
2. Hydrate the top `limit × 3` fused ids (`sql.ts:243-266`).
3. Walk the fused order, shaping each hit, until `limit` are collected:
   - `matched` = recipe ingredients some pantry item `covers`.
   - `missing` = not covered and not a staple (`isStaple`).
   - `coverage` = `1 − missing/ingredients` when a pantry was given, else 0.
     Staples count as had.
   - **Diet tag boost**: if any recipe `dietaryTag` equals a restriction
     (case-insensitive), `score × 1.15` and `reasons += 'diet'` (`:260-281`)
     **(KI-28)**.
4. Sort the `limit` results by score, descending.

### 5.4 Capability probe

`verifySearchCapability` (`sql.ts:269-309`) checks `pg_extension` for `vector`
and `pg_trgm`, and counts current-model embeddings. The result is cached on
the service until `invalidate()` is called by `/v1/index/rebuild`
(`retrieval/index.ts:99-117`).

## 6. Allergen and diet filtering

### 6.1 Tokenisation

Every in-memory check goes through `normalise(name)` =
`ingredientWords(name).filter(w => w.length > 2)` (`retrieval/terms.ts:27-29`).
`ingredientWords` (`food-measures/src/ingredients.ts:168-178`) does the
following, in order:

1. Lower-case.
2. Drop `( … )`.
3. Replace every character outside `[a-z\s-]` with a space. This drops digits
   and **accented letters** (`:172`) **(KI-5)**.
4. Split on whitespace and hyphens, and drop single characters.
5. `singular()` (`:46-56`):
   - irregular forms first (leaves, loaves, halves, geese, chillies, chilies,
     cookies, brownies, smoothies, veggies, molasses);
   - words of 3 characters or fewer, or ending in `ss` or `us`, are left
     alone;
   - `-ies` → `-y`;
   - `-oes` → `-o`;
   - `(ch|sh|x|z|ss)es` → drop `es`;
   - otherwise drop a trailing `s`.
6. Drop `NOISE` words (articles, clove, tin, can, jar, …, `:75-79`) and `PREP`
   words (fresh, chopped, unsalted, boneless, sea, caster, …, `:90-100`).
7. Fold synonyms (`:121-129`):
   - scallion / green onion → spring onion
   - zucchini → courgette
   - eggplant → aubergine
   - cilantro → coriander
   - chili → chilli
   - yogurt → yoghurt
   - garbanzo (bean) / chick pea → chickpea

Matching is **per token**, not by substring. `nut` matches "pine nuts" but not
"chestnut", "coconut" or "butternut". A multi-word term in a list can never
match a single token **(KI-10)**.

### 6.2 Allergen expansion

`expandAllergen(raw)` (`retrieval/terms.ts:131-150`) builds a set from four
sources:

1. `normalise(raw)` itself, which catches literal allergies such as "celery"
   or "mustard".
2. For each category in `ALLERGEN_TERMS`, the whole list is added when the
   lower-cased raw string **contains** the category name, or contains **any**
   term of that list as a substring.
3. If the raw string contains `nut`, the `peanut` list is added.
4. `dairy` or `lactose` adds the dairy list. `gluten`, `celiac` or `coeliac`
   adds the gluten list.

Because step 2 is a substring test, `peanut` contains `nut`, so a peanut
allergy also blocks all tree nuts. Likewise `eggplant` contains `egg` and
`avocado` contains `cod`. This errs toward over-blocking **(KI-11)**.

`ALLERGEN_TERMS` (`retrieval/terms.ts:42-75`), verbatim:

| Category | Terms |
|---|---|
| shellfish | shellfish, seafood, prawn, shrimp, crab, lobster, crayfish, langoustine, scampi, mussel, clam, oyster, scallop, squid, calamari, octopus, cockle, whelk, crustacean, mollusc, surimi |
| fish | fish, anchovy, salmon, tuna, cod, haddock, mackerel, sardine, trout, bass, halibut, monkfish, pollock, tilapia, kipper, worcestershire |
| nut | nut, almond, walnut, pecan, cashew, pistachio, hazelnut, macadamia, praline, marzipan, nutella, frangipane, amaretto |
| peanut | peanut, groundnut, satay |
| dairy | milk, butter, cheese, cream, yoghurt, yogurt, ghee, parmesan, mozzarella, cheddar, mascarpone, ricotta, creme, custard, buttermilk, paneer, feta, halloumi |
| gluten | flour, bread, breadcrumb, pasta, wheat, barley, rye, couscous, noodle, spaghetti, macaroni, pastry, filo, panko, semolina, bulgur, seitan, cracker, biscuit |
| egg | egg, mayonnaise, meringue, aioli |
| soy | soy, soya, tofu, edamame, miso, tempeh |
| sesame | sesame, tahini, halva |
| pork | pork, bacon, ham, chorizo, pancetta, prosciutto, lardon, gammon, salami, pepperoni, lard |

### 6.3 Diet expansion

`expandDiet(raw)` (`retrieval/terms.ts:120-128`):

1. Lower-case, trim, and replace whitespace with `-`.
2. Return the list for the **first** diet whose name, or whose name with the
   hyphen removed, is a **substring** of the result. Order:
   `pescatarian, vegetarian, vegan, dairy-free, gluten-free, halal, kosher`.
3. An unrecognised diet excludes nothing **(KI-12)**.

`DIET_EXCLUSIONS` (`:102-117`):

| Diet | Excludes |
|---|---|
| pescatarian | MEAT_TERMS + POULTRY_TERMS + pork |
| vegetarian | MEAT + POULTRY + pork + fish + shellfish |
| vegan | MEAT + POULTRY + pork + fish + shellfish + dairy + egg + `honey` |
| dairy-free | dairy |
| gluten-free | gluten |
| halal | pork |
| kosher | pork |

- `MEAT_TERMS` (`:81-85`): beef, steak, mince, brisket, veal, lamb, mutton,
  venison, goat, oxtail, liver, kidney, tripe, suet, gelatin, gelatine,
  meatball, burger, sausage, bolognese, `stock cube`, `beef stock`.
- `POULTRY_TERMS` (`:87-90`): chicken, turkey, duck, goose, poussin, quail,
  pheasant, `chicken stock`, schnitzel.

### 6.4 Where each filter applies

| Stage | Matcher | Allergies | Diets | Relaxable? | Ref |
|---|---|---|---|---|---|
| Retrieval (all 3 signals) | Postgres `~*` with `\y` word boundaries, on title and ingredient names | yes | yes | **Diets dropped** if the result set is empty | `sql.ts:79-87`, `retrieval/index.ts:141-149` |
| Compose allowed set | token set over the `allowed` names | yes | yes (named included) | no | `constraints.ts:98-112` |
| Compose prompt | plain-text EXCLUDED list | yes | yes | n/a (advisory) | `compose-recipe.ts:105-111` |
| Validator | token set over ingredient names and instruction text | yes | yes | no; safety failures are never accepted | `validate.ts:107-117,190-213` |
| Respond prompt | plain-text "ALLERGIES … never suggest" and "Dietary Restrictions" | yes | yes | advisory only | `chat-prompt.ts:99-121` |
| Respond card fallback | none; trusts the shortlist | inherited | inherited (possibly relaxed) | n/a | `respond.ts:233-248` |

`profileUnavailable` does not stop the turn. Allergies are then whatever the
API sent, possibly an empty list, and the only safeguard is the stated
compromise (`respond.ts:34-52`) **(KI-14)**.

## 7. Model routing

`services/agent/src/llm/provider.ts:61-132`. Callers name a role and
`modelFor(role)` resolves it (`:409-430`). Instances are cached per
`role:override`, and tests swap them with `setModel`.

| Role | Model | Temp | Max tokens | Reasoning | JSON mode | Caller |
|---|---|---|---|---|---|---|
| router | `GROQ_MODEL_FAST` (default `openai/gpt-oss-20b`) | 0 | 400 | low | yes | `router.ts:314` |
| search | FAST | 0 | 300 | low | yes | *unused* **(KI-37)** |
| compose | `GROQ_MODEL_SMART` (default `openai/gpt-oss-120b`) | 0.4 | 3000 | medium | yes | `compose-recipe.ts:181` |
| nutrition | FAST | 0 | 600 | low | yes | `nutrition/index.ts:160` |
| respond | FAST | 0.7 | 3000 | low | no | `respond.ts:190` |
| enrich | FAST | 0.3 | 2000 | low | yes | `enrich.ts:195` |

Every model uses `topP 0.9` (`:234`). JSON mode means
`response_format: { type: 'json_object' }` (`:246-248`). No request timeout or
retry count is set on `ChatGroq` (`:229-238`) **(KI-20)**.

**Fallback.** When a role's model equals `GROQ_MODEL_SMART` and no override is
given, it is wrapped in `WithFastFallback` (`:338-382,420-426`). On an error
whose translated message matches `/rate limit|usage limit/i`, and only when
not aborted, the call is re-issued once against `GROQ_MODEL_FAST` with
`reasoningEffort: 'low'`. Today that applies only to `compose` **(KI-36)**.

**Error translation** (`:306-326`):

| Condition | Error message thrown |
|---|---|
| Aborted | `Stream aborted` |
| Rate limit (`/rate_limit\|rate limit\|429/`) | Per-day (`/per day\|TPD\|tokens per day/`): "Petra has reached today's AI usage limit. It resets at midnight UTC." Otherwise: "Petra is at its rate limit. Try again in about N seconds." N comes from "try again in XmY.Zs", default 2 s (`:173-193`) |
| Anything else | `AI service is currently unavailable` (the provider message is logged only) |

Gemini (vision) is called directly with axios, outside the seam (§3.6).

## 8. Streaming and the safe-prefix logic

### 8.1 Path of a token

1. `GroqChatModel.stream` iterates `ChatGroq.stream` and forwards each
   non-empty raw delta to `onDelta`. On abort it `break`s and resolves with the
   text so far (`provider.ts:269-297`) **(KI-39)**.
2. `respond` accumulates `raw`, computes
   `safe = stripMarkdown(streamSafePrefix(raw))`, and emits
   `safe.slice(emitted.length)` **only when** `safe` is longer than `emitted`
   and starts with it (`respond.ts:197-209`). If sanitising changed text
   already sent, nothing more is emitted until the end.
3. After the model finishes, it parses the full reply. If `parsed.content`
   starts with `emitted` and is longer, the remainder is emitted. Otherwise it
   is not, and the client must take `done.data.content` as authoritative
   (`respond.ts:214-217`, comment `:19-24`).
4. `emitChunk` → `onChunk` → `send(res, {event:'chunk'})` → `encodeFrame`.

### 8.2 `streamSafePrefix(raw)`

`services/agent/src/llm/strip-markdown.ts:52-93`

1. Remove every **complete** `[recipe:…]` marker.
2. If the last `[` has no `]` after it, cut at that `[`. This withholds a
   marker that is still arriving, and also any other unclosed bracket.
3. For each of `*`, `_` and `` ` ``:
   - Scan the runs of that delimiter left to right with a stack. A run pops
     the top of the stack when the lengths match, and is pushed otherwise.
   - If anything is left on the stack, cut at the earliest left-over run.

   This rejects `**bold*`, which a parity count would accept.
4. Return `text.slice(0, minCut)`.

Effect: everything from the first unclosed construct onward is held back
until it closes or the reply ends. A lone `*` or `_` in prose, such as
"2 * 3" or `snake_case`, holds back the rest of that reply until the end.

### 8.3 `stripMarkdown`

`strip-markdown.ts:9-37` removes, in order:

- code fences, then inline code;
- `***`, `**`, `*` and `__` emphasis;
- `_x_` only at word boundaries;
- headings and blockquotes;
- links (the label is kept);
- bullets and numbered list prefixes;
- horizontal rules.

It then collapses 3 or more newlines to 2 and trims.

### 8.4 Wire codec

`packages/agent-contract/src/frames.ts`

- `encodeFrame` (`:39-41`) writes `event: <name>\ndata: <JSON>\n\n`. One
  `data:` line is always enough because JSON escapes newlines.
- `createFrameDecoder` (`:169-216`) is incremental. Text is buffered until a
  blank line. CRLF and lone CR are normalised, and a trailing `\r` is held
  until the next push (`:182`). Bytes go through a streaming `TextDecoder`,
  created lazily.
- `decodeFrame` (`:108-158`):
  - comment lines are ignored, so heartbeats yield nothing;
  - it returns `{ok:false}` with reason `malformed` (no data line, or bad
    JSON), `unknown-event`, or `invalid` (schema failure);
  - it never throws.

## 9. Error handling

| Failure | Behaviour | Ref |
|---|---|---|
| Invalid body | 400 `VALIDATION_ERROR` with flattened Zod details | `routes/index.ts:29-35`, `stream.ts:47-58` |
| Bad/missing internal key | 401 `INTERNAL_AUTH_FAILED` | `internal-auth.ts:27-41` |
| Router model or JSON fails | Heuristic intent and ingredients; turn continues | `router.ts:369-392` |
| Retrieval throws (search node) | Empty shortlist; turn continues ungrounded → compose | `search.ts:148-155` |
| One retrieval signal throws | Signal dropped | `retrieval/index.ts:188-209` |
| Embedding model fails to load | Semantic signal dropped; warm-up failure only logged | `index.ts:108-110` |
| Compose model throws / invalid output | Retry once with feedback; then respond without a draft | `compose-recipe.ts:191-235`, `graph/index.ts:72-84` |
| Weight estimation call fails | Those items unresolved | `nutrition/index.ts:191-197` |
| FDC / OFF request fails | `null` → `unresolved` (and negative-cached, **KI-23**) | `foods.ts:310-316,375-381` |
| Nutrition node throws / implausible | No macros; compromise stated | `nutrition.ts:59-70,82-87` |
| Respond model throws | Rethrown → turn fails | `respond.ts:272-277` |
| Graph ends without a response | `Error('AI service is currently unavailable')` | `orchestrator.ts:79-85` |
| `/v1/chat` any throw | 500 `INTERNAL_ERROR "Internal server error"` (message discarded) | `service-kit/src/errors.ts:204-208` |
| `/v1/chat/stream` throw, client present | `error` frame with the thrown message | `stream.ts:127-134` |
| `/v1/chat/stream` throw after abort | Silently end | `stream.ts:120-125` |
| Redis unreachable (cache) | `null` / `false`; disabled for 30 s | `cache/index.ts:27-31,82-105` |
| Redis error inside the checkpointer | **Not caught**; propagates and fails the turn (**KI-22**) | `checkpointer.ts:118-300` |
| Overflow source fails | `[]` | `overflow.ts:89-94` |
| Index rebuild embedding fails | Logged; 200 with `embedded: 0` | `routes/index.ts:142-151` |
| Gemini error | 500 with a translated message | `vision/index.ts:86-98,132-138` |
| Gemini reply unparseable (pantry item) | 200 with "Unknown Food Item" | `vision/index.ts:227-236` |
| Uncaught exception / unhandled rejection | Process exits(1) | `index.ts:124-132` |

## 10. Timeouts

| What | Value | Where |
|---|---|---|
| SSE heartbeat | 15 s | `routes/stream.ts:15` |
| Groq chat calls | **none set** (library defaults) | `provider.ts:229-238` **(KI-20)** |
| Gemini (pantry item, receipt) | 30 s | `vision/index.ts:73,126` |
| FoodData Central | 8 s per request | `foods.ts:291` |
| Open Food Facts | 8 s per request | `foods.ts:331` |
| TheMealDB overflow | 5 s | `overflow.ts:53` |
| Redis connect | 2 s; retry ×3 (200 ms·n, max 1 s); `maxRetriesPerRequest 1`; offline queue off | `cache/index.ts:50-56` |
| Redis disable-after-failure window | 30 s | `cache/index.ts:27` |
| Graph recursion | 12 steps | `graph/index.ts:138` |
| Embedding, Prisma, the graph as a whole | none | — |

Caller-side, in the API's `agent-client.ts:43-49`, outside this service:

- `health` 2 s
- `chat` 60 s, used for `/v1/chat` and `/v1/recipes/enrich`
- `vision` 30 s, used for both vision routes
- `retrieve` 10 s, used for `/v1/recipes/retrieve` and `/v1/index/rebuild`

The stream request uses the caller's abort signal and has no fixed timeout.
The agent does not observe the caller's timeout on any non-streaming route
**(KI-19)**.

## 11. Caching and TTLs

| Store | Key | TTL | Notes | Ref |
|---|---|---|---|---|
| Graph checkpoint (Redis) | `graph:cp:<thread>:<ns>:<id>` | `GRAPH_STATE_TTL_SECONDS` (default 3600), set on each write | Base64 of LangGraph serde JSON plus parent id | `checkpointer.ts:87-89,257-264` |
| Pending writes | `graph:cpw:<thread>:<ns>:<id>` (hash) | same | Fields are `taskId:NNNN` | `:91-93,271-300` |
| Checkpoint index | `graph:cpx:<thread>:<ns>` (zset, scored by wall clock) | same, refreshed | Newest first, never trimmed | `:96-98,262-263` |
| Thread registry | `graph:threads:<thread>` (set) | same, refreshed | Lets `deleteThread` avoid `SCAN` | `:106-114,302-311` |
| Graph state, no `REDIS_URL` | in-process `MemorySaver` | **none** | **(KI-25)** | `checkpointer.ts:326-335` |
| Nutrition lookup | `nutrition:food:<normalised name>` → `{ match }` | hit 86 400 s, miss 3 600 s | The envelope distinguishes a cached null from a miss | `foods.ts:271-283`, `cache/index.ts:123` |
| Overflow seeds | `overflow:<lower(message)[0..120]>` → `{ recipes }` | hit 86 400 s, miss 3 600 s | Holds raw user text **(KI-16)** | `overflow.ts:79-85` |
| Search capability | in-memory on `RetrievalService` | until `invalidate()` | | `retrieval/index.ts:99-117` |
| Compiled graph, model clients | in-memory singletons | process lifetime | | `graph/index.ts:106-122`, `provider.ts:384,409-430` |
| Embedding model | on-disk `TRANSFORMERS_CACHE` | permanent | ~90 MB | `embedding.ts:24` |

Thread ids are checked by `assertKeySafe`, which rejects `:` and `*`, on
`put`, `putWrites` and `deleteThread`. The check is not applied on reads
(`checkpointer.ts:64-75,122-124`).

## 12. Environment variables

All are read in `services/agent/src/config/index.ts:13-83`.

| Variable | Default | Required | Purpose |
|---|---|---|---|
| `NODE_ENV` | `development` | — | `production` makes the internal key mandatory and turns auth on; `development` adds stacks to error bodies |
| `AGENT_PORT` / `PORT` | `3002` | — | Listen port |
| `AGENT_DATABASE_URL` / `DATABASE_URL` | — | **yes** (`postgresql://`) | Recipe read model and embeddings |
| `GROQ_API_KEY` | — | **yes** | Every chat and enrich model call |
| `GEMINI_API_KEY` / `GOOGLE_AI_API_KEY` | — | no (vision throws without it) | Gemini vision |
| `GROQ_MODEL_FAST` | `openai/gpt-oss-20b` | — | router, nutrition, respond, enrich, compose fallback |
| `GROQ_MODEL_SMART` | `openai/gpt-oss-120b` | — | compose |
| `INTERNAL_API_KEY` | — | **in production** | Shared secret for `/v1/*` |
| `REDIS_URL` | — | no (warns) | Checkpoints, nutrition cache, overflow cache |
| `GRAPH_STATE_TTL_SECONDS` | `3600` | — | Checkpoint TTL |
| `FDC_API_KEY` | — | no (warns) | USDA FoodData Central |
| `RECIPE_OVERFLOW_ENABLED` | off (only `'true'` enables) | — | TheMealDB compose seeds |
| `TRANSFORMERS_CACHE` | `./.model-cache` | — | MiniLM cache directory |
| `LOG_LEVEL` | `info` | — | Logger |
| `LOG_FILE_PATH` | `./logs/agent.log` | — | Logger |
| `MAX_FILE_SIZE` | `10485760` | — | Read but unused **(KI-37)** |

## 13. External calls

| Destination | When | Data sent | Ref |
|---|---|---|---|
| Groq (`@langchain/groq`) | Every router, compose, nutrition-weight, respond and enrich call | Prompts. These include the user's messages, allergies, diets, health goals, pantry and recipe titles | `provider.ts:227-297` |
| `generativelanguage.googleapis.com` `gemini-pro-vision:generateContent` | `/vision/pantry-items`, `/vision/receipt` | Base64 image plus prompt; the key is in the query string | `vision/index.ts:30,44-75,112-127` |
| `api.nal.usda.gov/fdc/v1/foods/search` | Nutrition lookup on a cache miss, if `FDC_API_KEY` is set | Normalised ingredient name, `api_key` | `foods.ts:201,286-317` |
| `world.openfoodfacts.org/cgi/search.pl` | Nutrition lookup when FDC has nothing | Normalised ingredient name; UA `Petra-AI/1.0 (contact@petra-ai.com)` | `foods.ts:202,326-382` |
| `www.themealdb.com/api/json/v1/1/search.php` | Search node, only if overflow is enabled and the corpus came up thin | **The user's raw chat message** as `s=` | `overflow.ts:34,50-64` |
| Hugging Face hub (via `@xenova/transformers`) | First embedding-model load when the cache is empty | Model download (`allowRemoteModels` left at its default) | `embedding.ts:24-26,35-41` |
| PostgreSQL | Retrieval, nutrition `fromLibrary`, embeddings, boot probe | — | `db/index.ts`, `retrieval/sql.ts`, `retrieval/store.ts` |
| Redis | Checkpoints and caches | Full graph state, which includes context and messages | `cache/index.ts`, `graph/checkpointer.ts` |

## 14. Known issues

Ordered by impact within each group. "Safety" means a user could be served
something that violates a declared allergy or diet, or wrong health
information. Items marked *verify* depend on third-party behaviour the code
can't confirm.

### Safety

- **KI-1 — Nutrition follow-ups measure the wrong dish.** The router resets
  `draft` every turn (`router.ts:279`). "How many calories in that?" after a
  composed recipe is therefore routed `nutrition → search → nutrition`, and
  `fromLibrary` computes macros for `retrieved[0]`. That is whatever the raw
  question happened to retrieve, not the dish under discussion
  (`graph/index.ts:61`, `nutrition.ts:34-44,97-123`). The macro panel and a
  recipe card for an unrelated recipe are returned beside prose that may be
  talking about the previous dish. The same happens for "how healthy is X?".
- **KI-2 — Gluten list misses most pasta shapes and common gluten sources.**
  `linguine`, `penne`, `fusilli`, `tagliatelle`, `fettuccine`, `rigatoni`,
  `farfalle`, `orzo`, `lasagne`, `gnocchi`, `udon`, `tortilla`, `pita`,
  `naan`, `croissant`, `cake`, `beer`, `malt`, `spelt` and `soy sauce` are
  absent (`terms.ts:63-67`). `CATEGORY_ALIASES` knows linguine is pasta, but
  only for method-step licensing, not blocking (`terms.ts:166-177`). A
  gluten-allergic user can be offered the project's own reference dish
  (chicken, linguine, peppers), and retrieval will not filter linguine
  recipes.
- **KI-3 — Diet filters are silently dropped when retrieval comes back
  empty, and this includes `gluten-free`, `halal` and `kosher`.**
  `retrieval/index.ts:141-149` re-runs with allergens only and logs a warning.
  No compromise is surfaced. The respond node then attaches `shortlist[0]` as
  a card on any food turn (`respond.ts:233-248`). Its comment "already
  allergen-filtered, so the top of it is a safe card" does not hold for diets.
  A coeliac user who recorded "gluten-free" as a diet rather than an allergy
  can be shown a wheat dish with no warning.
- **KI-4 — The term lists are short for token matching, which needs every
  specific item named.** Examples that pass today:
  - fish: `swordfish`, `catfish`, `cuttlefish` (compound tokens), `herring`,
    `plaice`, `hake`, `carp`, `eel`, `roe`, `caviar`, `bonito`, `dashi`.
  - dairy: `whey`, `casein`, `kefir`, `brie`, `camembert`, `gouda`,
    `pecorino`, `quark`, `labneh`, `curd`.
  - nut: `pesto`, `chestnut`, `amaretti`, `nougat`, `macaron`, `romesco`,
    `dukkah`, `baklava`.
  - egg: `custard` (only in dairy), `brioche`, `hollandaise`, `mayo`,
    `carbonara`.
  - sesame: `hummus`, `za'atar`.
  - soy: `tamari`, `shoyu`, `natto`.
  - pork: `guanciale`, `nduja`, `mortadella`, `speck`.

  (`terms.ts:42-75`)
- **KI-5 — Accented names bypass every filter.** `ingredientWords` replaces
  anything outside `[a-z]` with a space (`food-measures/src/ingredients.ts:172`),
  so "crème fraîche" tokenises to `fra`, `che` and never matches `creme`. The
  Postgres pattern `\y(creme|cremes)\y` doesn't match `crème` either. The same
  applies to any accented spelling of a listed term.
- **KI-6 — The validator checks only ingredient names and instruction text.**
  Step `tip`, ingredient `notes`, `title`, `description`, `safetyNote` and
  `zeroWasteNote` are returned to the client unchecked
  (`validate.ts:97-213,268-285`). A tip such as "finish with a drizzle of
  tahini" passes for a sesame allergy.
- **KI-7 — Retrieval's safety clause checks title and ingredient names
  only.** It does not check `description`, ingredient `notes` or
  instructions, so a garnish named only in the method is not filtered
  (`sql.ts:79-87`).
- **KI-8 — The card fallback ignores fit.** After a failed compose,
  `retrieved` holds **all** hits, not only fitting ones (`search.ts:136`), and
  `respond` attaches `hits[0]` on any `compose`/`search` turn
  (`respond.ts:233-241`). It can miss the user's time limit, their named
  ingredients and, per KI-3, their diet.
- **KI-9 — The compose prompt contradicts itself when the user names a
  blocked item.** `constraintBlock` lists named ingredients as "must be built
  around them, all of them" without removing blocked ones
  (`compose-recipe.ts:75,84-88`). The same prompt then lists them as EXCLUDED.
  The validator catches this, but the conflict makes reject → retry → degrade
  likely, rather than a recipe composed without the item.
- **KI-10 — Multi-word terms are dead in the token sets.** `stock cube`,
  `beef stock` and `chicken stock` (`terms.ts:84,89`) can never equal a single
  token in `blockedTokens` (`constraints.ts:98-101,131-135`). They do match in
  SQL, so the two layers disagree. Plain `stock` and `broth` are not blocked
  for vegetarians at either layer.
- **KI-11 — Substring expansion over-blocks.** In `expandAllergen`
  (`terms.ts:137,142`):
  - "peanut" pulls in every tree nut;
  - "eggplant" pulls in egg;
  - "avocado" pulls in all fish via `cod`.

  Separately, token matching blocks plant milks, peanut butter, cocoa butter,
  butter beans and cream of tartar for dairy-free and vegan users, because of
  `milk`, `butter` and `cream`. The failure direction is safe, but it produces
  false compromises and failed composes.
- **KI-12 — Diet parsing is first-match, substring only.** A single string
  like "vegan, gluten-free" yields only the vegan list. "non-vegetarian"
  matches `vegetarian`. Unrecognised wordings exclude nothing: "plant-based",
  "veggie", "pescetarian", "no pork", "lactose-free", "coeliac" entered as a
  diet. Halal and kosher block pork only: no gelatine or alcohol for halal,
  no shellfish for kosher (`terms.ts:102-128`).
- **KI-14 — `profileUnavailable` turns off enforcement, not just the
  warning.** With an empty allergy list the validator has nothing to enforce,
  and a generated recipe is still shown. The only safeguard is the compromise
  line (`respond.ts:34-52`). This is the documented design, recorded here
  because it is the one path where allergy safety does rest on the reader.

### Security and privacy

- **KI-13 — The Gemini API key is likely written to logs.** The key is in the
  request URL (`vision/index.ts:45,113`), and every failure logs the raw axios
  error object (`:87,133`), which carries `config.url`.
- **KI-15 — Internal auth can be off outside `production`.** Any `NODE_ENV`
  other than `production` (for example `staging`) with an empty key accepts
  unauthenticated calls, and `validateConfig` does not object
  (`internal-auth.ts:23`, `config/index.ts:103`). The key comparison is also
  not constant-time (`internal-auth.ts:27`).
- **KI-16 — Overflow sends and stores raw chat text.** The user's full
  message goes to TheMealDB, is logged at info level, and is used as a 24-hour
  Redis key (`overflow.ts:79-87`). Off by default.
- **KI-17 — Stream `error` frames relay raw exception messages**
  (`stream.ts:127-133`). Provider errors are sanitised, but database, Redis or
  checkpointer errors are not.

### Correctness and operations

- **KI-18 — `/v1/chat` loses the rate-limit message.** The provider throws a
  plain `Error` carrying the user-readable message. The error handler maps
  that to `500 "Internal server error"` (`provider.ts:317`,
  `service-kit/src/errors.ts:204-208`). The stream route does deliver it.
- **KI-19 — No cancellation on the non-streaming routes.** `/v1/chat` and
  `/v1/recipes/enrich` never wire a signal. After the API's 60 s timeout the
  graph keeps running and spending tokens. Enrichment's nutrition step is
  sequential, up to 2 × 8 s per ingredient (`nutrition/index.ts:218-248`,
  `foods.ts:280`), so it can exceed 60 s on its own.
- **KI-20 — Groq calls have no explicit timeout or retry policy**
  (`provider.ts:229-238`). They inherit `@langchain/groq` defaults, which may
  include automatic retries on generation. The API deliberately avoids those.
  *verify the library defaults.*
- **KI-21 — `tokensUsed` is cumulative across the session.** The channel
  only ever adds and is never reset (`state.ts:168-171`). The reported value
  is `this call + state.tokensUsed` (`respond.ts:260`, `clarify.ts:54`), so it
  grows across the whole chat session.
- **KI-22 — The checkpointer does not follow the "Redis must never fail a
  turn" rule.** `getTuple`, `put` and `putWrites` don't catch command errors
  and don't call `disable()` (`checkpointer.ts:118-300`). A Redis failure
  after the connection is established fails the turn, and the next turn
  fails the same way.
- **KI-23 — Transient lookup failures are negative-cached for an hour.**
  `fromFdc` and `fromOpenFoodFacts` return `null` on error. `lookup` then
  caches `{ match: null }` for `TTL.miss` (`foods.ts:280-282,310-316,375-381`).
- **KI-24 — The `NOT_EATEN` regex misses its own examples.** It matches only
  bare "water" with a temperature or source prefix (`foods.ts:153`). "Pasta
  water", "reserved cooking water" and a discarded poaching stock, all cited
  in the comments, are looked up and summed.
- **KI-25 — `MemorySaver` grows without bound.** When `REDIS_URL` is unset,
  every thread's checkpoints stay in process memory forever
  (`checkpointer.ts:328`). Unset Redis is only a warning, even in production.
- **KI-26 — The router's empty-message path leaves stale state.** It skips
  setting `clarification`, `namedIngredients` and `servings` (`router.ts:307`).
  A clarification from the previous turn routes straight back to `clarify`
  and replays the old question.
- **KI-27 — The orchestrator's null-response guard can't fire.** `response`
  is checkpointed and never reset, so after a thread's first turn it is never
  null at the end (`orchestrator.ts:79`, `router.ts:278-292`). This is latent
  today because every path writes `response`. If that stops being true, the
  previous turn's reply would be returned.
- **KI-28 — The diet boost is applied after truncation**
  (`retrieval/index.ts:155-163,280`). The ×1.15 can only reorder the `limit`
  results already chosen. It can't promote a tagged recipe into them.
- **KI-29 — `gemini-pro-vision` has been retired by Google**
  (`vision/index.ts:30`). Both vision routes likely fail with every key.
  `mime_type` is also hard-coded to `image/jpeg` for any input (`:55,119`).
  *verify against the current Gemini model list.*
- **KI-30 — Pantry-item vision hides failures.** An unparseable reply returns
  200 with "Unknown Food Item" at confidence 0.1 instead of an error
  (`vision/index.ts:227-236`).
- **KI-31 — The vision response can violate the contract.** The prompt asks
  for `"number or null"` in `nutritionPer100g` (`vision/index.ts:177-182`),
  and the parser passes it through (`:225`). The contract field is
  `z.number().optional()`, which rejects `null`
  (`agent-contract/src/index.ts:423-430`).
- **KI-32 — No per-thread concurrency control.** Two simultaneous turns on
  one `threadId`, such as a double send, read the same checkpoint and
  interleave their writes (`orchestrator.ts:68-77`).
- **KI-38 — Receipt dedupe drops quantities.** The second line for the same
  item is discarded rather than merged (`receipt.ts:123-126`).
- **KI-39 — Aborted streams resolve as success.** `stream()` on abort
  `break`s and returns partial text as a normal completion
  (`provider.ts:284,293`).
- **KI-36 — `WithFastFallback.stream` would duplicate text.** It restarts
  from the first token after deltas were already forwarded (`provider.ts:362-374`).
  Latent today, because no streaming role uses the smart model.

### Contract and documentation drift

- **KI-33 — `/health` doesn't match `agentHealthSchema`.** It has `vision`
  instead of `embeddings`, and `status: 'healthy'` and `database: 'up'` are
  hard-coded. `recipesIndexed` is the public count from boot, not the number
  embedded (`index.ts:69-82`, `agent-contract/src/index.ts:441-450`).
- **KI-34 — Enrichment can return model-estimated macros.** When computed
  confidence is `low`, the model's figures are returned
  (`enrich.ts:141-147`). Nothing in the response marks them as estimated, and
  the contract says "there is no model-estimate"
  (`agent-contract/src/index.ts:116-120`).
- **KI-35 — "Named ingredients override a diet" is stated but not
  implemented.** The claim appears in `constraints.ts:107-110` and in the
  name of the test at `tests/allergen-safety.test.ts:100`. The code blocks
  them (`constraints.ts:111-112`), and the test asserts that it does
  (`:106`).
- **Other drift:**
  - `nutritionBreakdownSchema` says confidence is "'low' whenever any
    ingredient fell back to a model estimate"
    (`agent-contract/src/index.ts:137`). The code gives `medium`
    (`nutrition/index.ts:285-286`).
  - The `FDC_API_KEY` comment and warning say a missing key means "model
    estimates" (`config/index.ts:59-63,140`). It actually falls back to Open
    Food Facts name search.
  - `embedding.ts:25` says "nothing here should reach for a remote runtime",
    but remote model download is left enabled.
  - `DATA_TYPE_RANK` keys `Survey`, but FDC returns `Survey (FNDDS)`
    (`foods.ts:231-237`).
- **KI-37 — Dead code and config:**
  - the `search` row in `MODELS` (`provider.ts:77-84`);
  - `waitForRateLimit` (`:438`);
  - `MAX_FILE_SIZE` (`config/index.ts:82`);
  - `cosine` (`embedding.ts:74-79`);
  - `recognizeFromFile`, `recognizeBatch` and `getNutritionInfo`, which asks
    Gemini for macros, against the stated policy
    (`vision/index.ts:141-156,240-305`).
