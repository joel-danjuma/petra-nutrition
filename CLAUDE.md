# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Petra AI is a full-stack kitchen management application with AI-powered recipe discovery, meal planning, pantry tracking, and smart shopping lists. It is a TypeScript monorepo using npm workspaces.

## Commands

### Development

```bash
npm run dev              # Start all services concurrently (backend, web, mobile)
npm run dev:backend      # Backend only (Express on port 3001)
npm run dev:web          # Web frontend only (Next.js on port 3000)
npm run dev:mobile       # Mobile app only (Expo)
```

### Building

```bash
npm run build            # Build all packages
npm run build:backend    # Backend only
npm run build:web        # Web frontend only
```

### Testing

```bash
npm run test             # Run all tests
npm run test:backend     # Backend tests only (Jest + Supertest)
npm run test:web         # Web tests only
```

Run a single test file:
```bash
cd packages/backend && npx jest src/path/to/test.spec.ts
cd packages/web && npx jest src/path/to/test.spec.ts
```

### Linting & Type Checking

```bash
npm run lint             # ESLint across all packages
npm run lint:fix         # Auto-fix lint issues
npm run type-check       # TypeScript compilation check (no emit)
```

### Database

```bash
npm run db:migrate       # Run pending Prisma migrations
npm run db:studio        # Open Prisma Studio GUI
npm run db:seed          # Seed test data
```

### Docker

```bash
# Start only infrastructure services for local dev
docker-compose -f docker/docker-compose.dev.yml up -d postgres redis

# Full production stack
cd docker && docker-compose up -d

# Run migrations inside running container
docker-compose exec backend npx prisma migrate deploy
```

## Architecture

### Monorepo Structure

```
packages/
  shared/     # Shared types, API client, Zustand stores, utilities
  backend/    # Express REST API (port 3001)
  web/        # Next.js 14 App Router frontend (port 3000)
  mobile/     # React Native / Expo app (foundation stage)
docker/       # Dockerfile and docker-compose files
scripts/      # Deployment automation
.github/workflows/ci-cd.yml  # GitHub Actions CI/CD
```

### Shared Package (`packages/shared`)

Acts as the contract layer between frontend and backend:
- `src/types/` — Zod schemas used for runtime validation and TypeScript types
- `src/api/` — Axios-based API client with interceptors (used by both web and mobile)
- `src/store/` — Zustand stores (`auth`, `pantry`) shared across web and mobile
- `src/utils/` — Date, nutrition, formatting, and validation helpers

The path alias `@petra/shared/*` resolves to `packages/shared/src/*` via `tsconfig.json` project references.

### Backend (`packages/backend`)

Express + TypeScript REST API following a layered architecture:
- `src/routes/` — Route definitions (thin, delegates to controllers)
- `src/controllers/` — Request handling and response shaping
- `src/services/` — Domain logic (`auth`, `pantry`, `recipe`, `mealPlan`, `chat`, `email`, `subscription`)
- `src/middleware/` — Auth (JWT), validation (Zod), rate limiting, brute-force protection, error handling
- `src/database/` — Prisma client, query helpers, transactions
- `src/config/` — Environment config, Redis client setup
- `src/utils/` — Winston logger and helpers
- `prisma/schema.prisma` — Single source of truth for the database schema

Key integrations:
- **GroqAPI** (Llama 3 8B/70B) for AI chat
- **Google Gemini Pro Vision** for food image recognition
- **OpenFoodFacts / UPC Database** for barcode scanning
- **Redis** for session caching and rate limiting
- **Nodemailer** for transactional email

### Web Frontend (`packages/web`)

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

Configured via `.eslintrc.json` and `.prettierrc`:
- TypeScript strict mode enabled
- No `any` types
- Single quotes, semicolons, 80-char line width, 2-space indent, ES5 trailing commas
- Arrow function parens omitted for single args

## Environment Setup

Each package requires its own `.env` file. The backend needs:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `GROQ_API_KEY` — for Llama 3 AI chat
- `GOOGLE_AI_API_KEY` — for Gemini Pro Vision
- `SMTP_*` — email configuration

See `README.md` for the full list of required environment variables.
