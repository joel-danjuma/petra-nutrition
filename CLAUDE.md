# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Petra AI is a full-stack kitchen management application with AI-powered recipe discovery, meal planning, pantry tracking, and smart shopping lists. It is a TypeScript monorepo using pnpm workspaces, split into three independently deployable services.

## Commands

### Development

```bash
pnpm run dev             # Start everything concurrently (api, agent, web, mobile)
pnpm run dev:api         # API gateway only (Express on port 3001)
pnpm run dev:agent       # Agent service only (Express on port 3002)
pnpm run dev:web         # Web frontend only (Next.js on port 3000)
pnpm run dev:mobile      # Mobile app only (Expo)
```

The API refuses to start in production if the agent is unreachable, and warns
loudly in development. Chat, meal-plan generation and the pantry photo scan all
go through the agent; everything else works without it.

### Building

```bash
pnpm run build           # Build all packages
pnpm --filter @petra/api run build
pnpm --filter @petra/agent run build    # regenerates the read model, then tsc
pnpm --filter @petra/web run build
```

### Testing

```bash
pnpm run test            # Run all tests
pnpm --filter @petra/api test
pnpm --filter @petra/agent test
pnpm --filter @petra/web test
```

Run a single test file:
```bash
pnpm --filter @petra/api exec jest src/path/to/test.spec.ts
```

### Linting & Type Checking

```bash
pnpm run lint            # ESLint across all packages
pnpm run lint:fix        # Auto-fix lint issues
pnpm run type-check      # TypeScript compilation check (no emit)
```

ESLint enforces the service boundary: `services/api` may not import from
`services/agent` or vice versa. The permitted channel is `@petra/agent-contract`.

### Database

```bash
pnpm --filter @petra/api run db:migrate   # Run pending migrations (API owns them)
pnpm --filter @petra/api run db:studio
pnpm --filter @petra/api run db:seed
pnpm --filter @petra/agent run embed      # Rebuild the semantic index

# The agent's Prisma schema is GENERATED from the API's — never edit it:
pnpm --filter @petra/agent run sync-schema        # regenerate
pnpm --filter @petra/agent run sync-schema:check  # CI drift gate
```

### Docker

```bash
# Start only infrastructure services for local dev
docker-compose -f docker/docker-compose.dev.yml up -d postgres redis

# Full production stack
cd docker && docker-compose up -d

# Run migrations inside the running container (the API owns them)
docker compose exec api npx prisma migrate deploy
```

The agent has no `ports:` block on purpose — it is reachable only from other
containers on `petra-network`, and nginx does not route to it. Its only
authentication is `INTERNAL_API_KEY`, so publishing it would expose an
unauthenticated model endpoint.

## Architecture

### Monorepo Structure

```
services/
  api/        Express REST API — the public gateway (port 3001)
  agent/      AI service — chat, retrieval, embeddings, vision (port 3002, private)
apps/
  web/        Next.js 14 App Router frontend (port 3000)
  mobile/     React Native / Expo app
packages/
  shared/           Shared types, API client, Zustand stores, design tokens
  agent-contract/   Zod wire contract between the API and the agent
  service-kit/      Logger and HTTP error semantics, shared by both services
docker/       Dockerfiles (api, agent, web) and compose files
scripts/      Design-token generation and deployment automation
.github/workflows/ci-cd.yml  GitHub Actions CI/CD
```

### The service split

Three independently deployable services, one repo. The split is invisible to
clients: mobile and web talk to `:3001/api` exactly as before.

| | API (`services/api`) | Agent (`services/agent`) |
|---|---|---|
| Owns | Auth, all persistence, every Prisma migration | Prompts, model choice, retrieval, the embedding index |
| Holds | JWT secrets, SMTP, Stripe | `GROQ_API_KEY`, `GEMINI_API_KEY` |
| Database | Everything | Reads recipes; owns `recipe_embeddings` only |
| Reachable from | The internet, via nginx | The API only, on the private network |

The agent is **stateless with respect to user data**. Everything it knows about
the caller arrives in the request body; it cannot express a query against users,
pantry or chat because those models do not exist in its schema.

The dividing line came from `ChatController.buildUserContext`, which used to do
two unrelated jobs — load the user's profile and pantry, and run recipe
retrieval. The first half stayed; the second moved.

### Agent contract (`packages/agent-contract`)

Zod schemas for every request and response between the two services. Both sides
import them, so a contract drift is a type error at build time rather than a
malformed body in production.

Endpoints (all under `/v1`, all requiring `X-Internal-Key`):
`chat`, `chat/stream`, `recipes/retrieve`, `recipes/generate`, `recipes/enrich`,
`meal-plans/generate`, `cooking-tips`, `nutrition/analyze`,
`vision/pantry-items`, `index/rebuild`. `/health` is unauthenticated.

### The agent's Prisma schema is generated

`services/agent/prisma/schema.prisma` is a **generated projection** of the API's
schema, limited to the four recipe models. Never edit it by hand — run
`pnpm --filter @petra/agent run sync-schema`. CI runs `sync-schema:check`, so a
schema change the agent has not absorbed fails the pull request that made it,
rather than failing at chat time in production. The agent also probes its read
model at boot, turning a drifted column into a failed deploy.

### API (`services/api`)

Express + TypeScript, layered:
- `src/routes/` — Route definitions (thin, delegates to controllers)
- `src/controllers/` — Request handling and response shaping
- `src/services/` — Domain logic, plus `agent-client.ts`, the typed HTTP client
  for the agent (keep-alive pool, tiered timeouts, no retries on generation)
- `src/middleware/` — Auth (JWT), validation (Zod), rate limiting, error handling
- `src/database/` — Prisma client, query helpers, transactions
- `prisma/schema.prisma` — **The** source of truth for the database schema

### Agent (`services/agent`)

- `src/orchestrator.ts` — One chat turn, start to finish. A pure function from
  request to reply, which is what makes it testable without a database.
- `src/llm/groq.ts` — Groq client, prompt, markdown stripping, streaming
- `src/llm/enrich.ts` — Structured recipe extraction and its plausibility checks
- `src/retrieval/` — Hybrid retrieval (RRF over pantry overlap, lexical,
  semantic) and the local MiniLM embedding model
- `src/vision/` — Gemini Pro Vision food recognition
- `src/db/` — Narrow Prisma client plus the boot-time read-model probe

Barcode lookup deliberately stayed in the API (`services/barcode.ts`): it is an
external data fetch, not inference.

### Web Frontend (`apps/web`)

Next.js 14 App Router with:
- `src/app/` — Pages and layouts (file-system routing)
- `src/components/` — Reusable React components (shadcn/ui + Radix UI primitives)
- `src/hooks/` — Custom React hooks
- `src/lib/` — Client-side utilities
- Styling: Tailwind CSS
- State: Zustand stores from `@petra/shared`
- Forms: React Hook Form + Zod validation

### Database Schema (Prisma)

Core models: `users`, `user_profiles`, `recipes`, `recipe_ingredients`, `recipe_instructions`, `recipe_nutrition`, `pantry_items`, `meal_plans`, `shopping_lists`, `chat_sessions`, `chat_messages`, `user_favorites`, `user_ratings`.

Key enums: `SubscriptionTier` (FREE/PREMIUM), `Difficulty` (EASY/MEDIUM/HARD), `ActivityLevel`, `HealthGoal`.

### API Route Structure

All routes are prefixed `/api/`:
- `/auth` — register, login, refresh, logout, verify-email, password-reset
- `/users` — profile, preferences
- `/recipes` — search, generate (AI), details, similar
- `/pantry` — CRUD, barcode scan, image recognition
- `/meal-plans` — generate (AI), CRUD
- `/shopping-lists` — generate from meal plans, CRUD
- `/chat` — sessions, streaming message endpoint
- `/subscription` — tier info, upgrade
- `/analytics` — usage tracking

## Code Style

Configured via `eslint.config.mjs` and `.prettierrc`:
- TypeScript strict mode enabled
- No `any` types
- Single quotes, semicolons, 80-char line width, 2-space indent, ES5 trailing commas
- Arrow function parens omitted for single args

## Environment Setup

Each service requires its own `.env`. The keys are deliberately split so that
the process handling passwords and tokens holds no model provider credentials.

`services/api/.env`:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `AGENT_URL` — where the agent lives (default `http://localhost:3002`)
- `INTERNAL_API_KEY` — shared secret presented to the agent; required in production
- `SMTP_*` — email configuration

`services/agent/.env`:
- `AGENT_DATABASE_URL` — ideally a role with SELECT on the recipe tables and
  DML on `recipe_embeddings` only
- `GROQ_API_KEY` — chat and structured extraction
- `GOOGLE_AI_API_KEY` (or `GEMINI_API_KEY`) — Gemini Pro Vision
- `GROQ_MODEL_FAST` / `GROQ_MODEL_SMART` — model availability is per-account;
  check with `curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"`
- `INTERNAL_API_KEY` — must match the API's
- `TRANSFORMERS_CACHE` — where the ~90MB MiniLM model is cached

Both services validate their configuration at boot and refuse to start rather
than failing on the first request.

See `README.md` for the full list of required environment variables.
