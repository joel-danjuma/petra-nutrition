# Petra AI - Intelligent Kitchen Assistant

Petra AI is a comprehensive kitchen management application that combines artificial intelligence with practical cooking tools. It helps users discover recipes, plan meals, manage pantry inventory, and create smart shopping lists.

## 🏗️ Architecture

This project is built as a **monorepo** containing three main applications:

- **Backend Service** (`packages/backend`): Express.js API with PostgreSQL and Redis
- **Web Frontend** (`packages/web`): Next.js web application with modern UI
- **Mobile App** (`packages/mobile`): React Native app with Expo (coming soon)
- **Shared Package** (`packages/shared`): Common types, API client, and utilities

## ✨ Features

### Core Features (Free)
- 🤖 **AI Chat Agent**: Conversational interface powered by Llama 3
- 🍳 **Recipe Discovery**: Search and generate recipes based on preferences
- 👤 **User Profiles**: Personal preferences, dietary restrictions, and health goals
- 📱 **Cross-Platform**: Available on web and mobile

### Premium Features
- 🥘 **Meal Planning**: Multi-day meal plans with nutritional analysis
- 📦 **Pantry Management**: Digital inventory with barcode scanning and image recognition
- 🛒 **Smart Shopping Lists**: Auto-generated from meal plans, cross-referenced with pantry

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose
- PostgreSQL 15+ (or use Docker)
- Redis 7+ (or use Docker)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/petra-ai.git
   cd petra-ai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   # Backend
   cp packages/backend/env.example packages/backend/.env
   # Edit packages/backend/.env with your configuration

   # Web
   cp packages/web/.env.example packages/web/.env.local
   # Edit packages/web/.env.local with your configuration
   ```

4. **Start development services**
   ```bash
   # Start database and Redis with Docker
   docker-compose -f docker/docker-compose.dev.yml up -d postgres redis

   # Run database migrations
   cd packages/backend && npx prisma migrate dev

   # Start all services
   npm run dev
   ```

5. **Access the applications**
   - Web Frontend: http://localhost:3000
   - Backend API: http://localhost:3001
   - API Documentation: http://localhost:3001/docs

### Production Deployment

1. **Configure environment variables**
   ```bash
   cp docker/.env.example docker/.env
   # Edit docker/.env with production values
   ```

2. **Deploy with Docker Compose**
   ```bash
   cd docker
   docker-compose up -d
   ```

3. **Run database migrations**
   ```bash
   docker-compose exec backend npx prisma migrate deploy
   ```

## 🛠️ Development

### Project Structure

```
petra-ai/
├── packages/
│   ├── shared/           # Shared types, API client, state management
│   ├── backend/          # Express.js API server
│   ├── web/             # Next.js web application
│   └── mobile/          # React Native mobile app (coming soon)
├── docker/              # Docker configuration
├── docs/                # Documentation
└── package.json         # Root package.json for monorepo
```

### Available Scripts

```bash
# Development
npm run dev              # Start all services in development
npm run dev:backend      # Start only backend
npm run dev:web          # Start only web frontend

# Building
npm run build            # Build all packages
npm run build:backend    # Build only backend
npm run build:web        # Build only web frontend

# Testing
npm run test             # Run all tests
npm run test:backend     # Run backend tests
npm run test:web         # Run web frontend tests

# Linting
npm run lint             # Lint all packages
npm run lint:fix         # Fix linting issues

# Database
npm run db:migrate       # Run database migrations
npm run db:studio        # Open Prisma Studio
npm run db:seed          # Seed database with sample data
```

### Technology Stack

#### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Authentication**: JWT with refresh tokens
- **AI Integration**: GroqAPI (Llama 3), Gemini Pro Vision
- **Email**: Nodemailer
- **File Upload**: Multer with Sharp for image processing

#### Web Frontend
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI with shadcn/ui
- **State Management**: Zustand
- **Forms**: React Hook Form with Zod validation
- **Animation**: Framer Motion

#### Mobile App (Coming Soon)
- **Framework**: React Native with Expo
- **Navigation**: React Navigation
- **Camera**: Expo Camera and Barcode Scanner
- **Storage**: Expo SecureStore

#### Shared
- **Type Safety**: Zod schemas for runtime validation
- **API Client**: Axios with interceptors
- **State Management**: Zustand stores
- **Utilities**: Date, formatting, and validation helpers

## 🔧 Configuration

### Environment Variables

The keys are split across two `.env` files on purpose: the process that hashes
passwords and signs tokens holds no model provider credentials.

#### API gateway (`services/api/.env`)
```env
# Database. Postgres 15 with pgvector — recipe embeddings are a vector(384)
# column with an HNSW index, and the migrations run `CREATE EXTENSION vector`.
# docker-compose uses pgvector/pgvector:pg15 for exactly this reason.
DATABASE_URL="postgresql://username:password@localhost:5432/petra_ai"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-super-secret-jwt-key-here"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-here"

# Where the agent lives, and the shared secret presented to it.
AGENT_URL="http://localhost:3002"
INTERNAL_API_KEY=""   # required in production

# Email
SMTP_HOST="smtp.gmail.com"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
```

#### Agent (`services/agent/.env`)
```env
# Ideally a role with SELECT on the recipe tables and DML on
# recipe_embeddings only.
AGENT_DATABASE_URL="postgresql://username:password@localhost:5432/petra_ai"

# Model providers. Availability is per-account; check what a key can reach:
#   curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"
GROQ_API_KEY="your-groq-api-key"
GOOGLE_AI_API_KEY="your-gemini-api-key"
GROQ_MODEL_FAST="openai/gpt-oss-20b"
GROQ_MODEL_SMART="openai/gpt-oss-120b"

INTERNAL_API_KEY=""   # must match the API's

# Redis, for the chat graph's TTL'd working state and the nutrition lookup
# cache. Unset is supported — both fall back to in-process memory.
REDIS_URL="redis://localhost:6379"
GRAPH_STATE_TTL_SECONDS="3600"

# USDA FoodData Central, for raw-ingredient macros. Free key:
#   https://fdc.nal.usda.gov/api-key-signup.html
# Unset is supported — nutrition falls back to model estimates and labels them
# low-confidence rather than presenting a guess as a measurement.
FDC_API_KEY=""

# Consult an external recipe source when the local corpus is thin. Off by
# default: each hit is a third-party request on a chat turn's critical path,
# and TheMealDB is licensed for development and education only.
RECIPE_OVERFLOW_ENABLED="false"

# Where the ~90MB MiniLM embedding model is cached.
TRANSFORMERS_CACHE="./.model-cache"
```

#### Web Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL="http://localhost:3001/api"
NEXT_PUBLIC_WEB_URL="http://localhost:3000"
```

### AI Service Setup

1. **Groq**: Sign up at [console.groq.com](https://console.groq.com). Serves chat,
   the router, and recipe composition.
2. **Gemini Pro Vision**: Get an API key from
   [Google AI Studio](https://makersuite.google.com/app/apikey). Pantry photo scan.
3. **USDA FoodData Central**: Free key from
   [fdc.nal.usda.gov](https://fdc.nal.usda.gov/api-key-signup.html). Raw-ingredient
   macros. Optional — the nutrition node degrades to labelled estimates without it.

### Building the recipe library

```bash
# A few hundred photographed recipes over HTTP, no key needed.
pnpm --filter @petra/api run db:import-recipes

# Or a downloaded open corpus, streamed from disk and idempotent on source.
# --require-image matters: the app is image-led, and open corpora carry little
# photography.
pnpm --filter @petra/api run db:import-dataset -- ./data/recipes.jsonl --require-image

# Then build the semantic vectors. This is the long pole on a large corpus —
# read the sizing note at the top of the script, and use --limit to measure the
# rate on a sample before committing to a full run.
pnpm --filter @petra/agent run embed
```

## 📱 Mobile App

The React Native mobile app is planned for Phase 2 and will include:

- Native camera integration for barcode scanning
- Image recognition for fresh produce
- Offline recipe storage
- Push notifications for meal reminders
- Apple Wallet / Google Pay integration for shopping lists

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test suites
npm run test packages/backend/src/controllers/auth.test.ts
```

## 📚 API Documentation

The API documentation is automatically generated and available at:
- Development: http://localhost:3001/docs
- Production: https://api.petra-ai.com/docs

### Key Endpoints

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/recipes/search` - Search recipes
- `POST /api/recipes/generate` - Generate recipe with AI
- `GET /api/pantry` - Get pantry items
- `POST /api/pantry/scan/barcode` - Scan barcode
- `POST /api/meal-plans/generate` - Generate meal plan
- `POST /api/chat/message` - Send chat message

## 🚀 Deployment

### Google Cloud VM Deployment

1. **Create VM instance**
   ```bash
   gcloud compute instances create petra-ai-vm \
     --zone=us-central1-a \
     --machine-type=e2-standard-2 \
     --image-family=ubuntu-2004-lts \
     --image-project=ubuntu-os-cloud \
     --boot-disk-size=50GB
   ```

2. **Install Docker and Docker Compose**
   ```bash
   # SSH into the VM and run setup script
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   sudo usermod -aG docker $USER
   ```

3. **Deploy application**
   ```bash
   # Clone repository
   git clone https://github.com/your-org/petra-ai.git
   cd petra-ai/docker

   # Configure environment
   cp .env.example .env
   # Edit .env file

   # Deploy
   docker-compose up -d
   ```

### Domain and SSL Setup

1. **Configure DNS** to point to your VM's external IP
2. **Set up SSL certificates** using Let's Encrypt:
   ```bash
   # Install certbot
   sudo apt install certbot

   # Get certificate
   sudo certbot certonly --standalone -d petra-ai.com -d api.petra-ai.com

   # Update nginx configuration to use SSL
   ```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- 📧 Email: support@petra-ai.com
- 💬 Discord: [Join our community](https://discord.gg/petra-ai)
- 📖 Documentation: [docs.petra-ai.com](https://docs.petra-ai.com)
- 🐛 Bug Reports: [GitHub Issues](https://github.com/your-org/petra-ai/issues)

## 🗺️ Roadmap

### Phase 1 (Current)
- ✅ Core web application
- ✅ AI chat integration
- ✅ Recipe management
- ✅ User authentication
- 🔄 Pantry management
- 🔄 Meal planning

### Phase 2 (Q1 2024)
- 📱 Mobile app launch
- 🔍 Advanced image recognition
- 🛒 Shopping list sharing
- 📊 Nutrition tracking
- 🔔 Smart notifications

### Phase 3 (Q2 2024)
- 🏪 Grocery store integration
- 👥 Family sharing features
- 📈 Advanced analytics
- 🌍 Multi-language support
- 🎯 Personalized recommendations

---

Made with ❤️ by the Petra AI Team
