import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3001', 10),
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:3001',
  WEB_BASE_URL: process.env.WEB_BASE_URL || 'http://localhost:3000',
  
  // Database
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/petra_ai',
  DATABASE_URL_TEST: process.env.DATABASE_URL_TEST || 'postgresql://postgres:password@localhost:5432/petra_ai_test',
  
  // Redis
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'your-super-secret-jwt-key-here',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key-here',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  
  // Email
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  FROM_EMAIL: process.env.FROM_EMAIL || 'noreply@petra-ai.com',
  FROM_NAME: process.env.FROM_NAME || 'Petra AI',
  
  // AI services
  //
  // The model provider keys are deliberately absent: they live in the agent
  // service and nowhere else, so the process that hashes passwords and signs
  // JWTs no longer holds credentials for Groq or Gemini. Everything
  // inference-shaped is reached over this URL instead.
  AGENT_URL: process.env.AGENT_URL || 'http://localhost:3002',
  /** Shared secret presented to the agent. See middleware/internal-auth there. */
  INTERNAL_API_KEY: process.env.INTERNAL_API_KEY || '',
  
  // File Storage
  UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB
  
  // Security
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  CORS_ORIGINS: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:19006'],
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FILE_PATH: process.env.LOG_FILE_PATH || './logs/app.log',
  
  // Features
  ENABLE_EMAIL_VERIFICATION: process.env.ENABLE_EMAIL_VERIFICATION === 'true',
  ENABLE_PASSWORD_RESET: process.env.ENABLE_PASSWORD_RESET === 'true',
  ENABLE_AI_FEATURES: process.env.ENABLE_AI_FEATURES === 'true',
  ENABLE_IMAGE_RECOGNITION: process.env.ENABLE_IMAGE_RECOGNITION === 'true',
  ENABLE_BARCODE_SCANNING: process.env.ENABLE_BARCODE_SCANNING === 'true',
  
  // Subscription
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  PREMIUM_PRICE_ID: process.env.PREMIUM_PRICE_ID || '',
} as const;

// Environment-specific configs. Declared before validateConfig because it
// reads isProduction.
export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';

// Validate required environment variables
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  // Chat, meal-plan generation and the pantry scan all go through the agent.
  // A missing URL used to surface as those three features failing while
  // everything else worked — a confusing shape for a configuration error.
  'AGENT_URL',
] as const;

export const validateConfig = () => {
  const missing = requiredEnvVars.filter(key => !config[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Validate JWT secrets are strong enough
  if (config.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }
  
  if (config.JWT_REFRESH_SECRET.length < 32) {
    throw new Error('JWT_REFRESH_SECRET must be at least 32 characters long');
  }
  
  // Validate database URL format
  if (!config.DATABASE_URL.startsWith('postgresql://')) {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection string');
  }

  // The agent authenticates callers by shared secret alone, so in production an
  // unset key means either a 401 on every chat turn or, worse, an agent that
  // accepts anyone who can reach it.
  if (isProduction && !config.INTERNAL_API_KEY) {
    throw new Error('INTERNAL_API_KEY is required in production');
  }
};
