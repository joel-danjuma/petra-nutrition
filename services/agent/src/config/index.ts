import dotenv from 'dotenv';

dotenv.config();

/**
 * The agent's configuration.
 *
 * Note what is *absent*: no JWT secrets, no SMTP, no Stripe. The agent never
 * authenticates a user or sends mail — it is reached only by the API over the
 * private network. Conversely the model provider keys live here and nowhere
 * else, so the service that hashes passwords no longer holds them.
 */
export const config = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.AGENT_PORT || process.env.PORT || '3002', 10),
  SERVICE_NAME: 'agent',

  /**
   * Recipe catalogue access. In production this should be a role with SELECT on
   * recipes/recipe_ingredients and full DML on recipe_embeddings only — the
   * agent owns its index and nothing else, and that is worth enforcing in the
   * database rather than by convention.
   */
  DATABASE_URL: process.env.AGENT_DATABASE_URL || process.env.DATABASE_URL || '',

  // Model providers
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  // Accepts either name: env.example documents GEMINI_API_KEY while the README
  // and the running .env use GOOGLE_AI_API_KEY.
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '',

  // Groq model IDs. Kept in config because they are the thing most likely to
  // change — Groq retires model IDs, and availability is per-account. Check
  // what a key can reach with:
  //   curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"
  GROQ_MODEL_FAST: process.env.GROQ_MODEL_FAST || 'openai/gpt-oss-20b',
  GROQ_MODEL_SMART: process.env.GROQ_MODEL_SMART || 'openai/gpt-oss-120b',

  /** Shared secret the API presents. The agent has no other authentication. */
  INTERNAL_API_KEY: process.env.INTERNAL_API_KEY || '',

  TRANSFORMERS_CACHE: process.env.TRANSFORMERS_CACHE || './.model-cache',

  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FILE_PATH: process.env.LOG_FILE_PATH || './logs/agent.log',

  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB
} as const;

export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction = config.NODE_ENV === 'production';

/**
 * Fail at boot, not at the first chat turn.
 *
 * A missing GROQ_API_KEY used to surface as a runtime throw inside the chat
 * handler, which read to the user as "the AI is broken" rather than "this
 * deploy is misconfigured".
 */
export const validateConfig = (): void => {
  const missing: string[] = [];

  if (!config.DATABASE_URL) missing.push('AGENT_DATABASE_URL (or DATABASE_URL)');
  if (!config.GROQ_API_KEY) missing.push('GROQ_API_KEY');

  // Required in production only, so a local `pnpm dev` needs no ceremony —
  // but then the gateway must be equally lenient or every call 401s.
  if (isProduction && !config.INTERNAL_API_KEY) missing.push('INTERNAL_API_KEY');

  if (missing.length > 0) {
    throw new Error(
      `Agent is missing required environment variables: ${missing.join(', ')}`
    );
  }

  if (!config.DATABASE_URL.startsWith('postgresql://')) {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection string');
  }
};
