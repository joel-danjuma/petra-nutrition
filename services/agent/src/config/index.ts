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

  /**
   * Redis, used for two things the agent owns outright: graph working state and
   * the nutrition-database lookup cache. Neither is durable — the API still
   * owns the transcript, and a cold cache costs latency rather than
   * correctness — so the agent degrades to in-process memory when Redis is
   * unreachable rather than refusing to answer.
   */
  REDIS_URL: process.env.REDIS_URL || '',

  /**
   * How long a graph thread's working state lives. Long enough to resume a
   * turn the user is still in, short enough that abandoned conversations do
   * not accumulate in a cache nobody prunes.
   */
  GRAPH_STATE_TTL_SECONDS: parseInt(process.env.GRAPH_STATE_TTL_SECONDS || '3600', 10),

  /**
   * USDA FoodData Central, for raw-ingredient macros. Free, and rate limited
   * per key. Unset is a supported configuration: the nutrition node falls back
   * to a model estimate and labels the result low-confidence, which is honest
   * and still better than no macros at all.
   */
  FDC_API_KEY: process.env.FDC_API_KEY || '',

  /**
   * Consult an external recipe source when the local corpus is thin.
   *
   * Off by default, because every hit is a third-party request on the critical
   * path of a chat turn, and because the source currently available
   * (TheMealDB) is licensed for development and education only. External
   * results seed the compose node; they are never recommended, since a recipe
   * with no row cannot be opened or cooked from.
   */
  RECIPE_OVERFLOW_ENABLED: process.env.RECIPE_OVERFLOW_ENABLED === 'true',

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

/**
 * Configuration that is missing but not fatal.
 *
 * Returned rather than logged because `config` must not import the logger —
 * the logger reads `config`, and the cycle resolves to an undefined logger at
 * module-init time. The entry point logs these once at boot.
 *
 * Both entries below are deliberately warnings. Chat has to keep working when
 * the cache and the nutrition database are unavailable, so refusing to boot
 * over either would be a worse trade than degrading.
 */
export const configWarnings = (): string[] => {
  const warnings: string[] = [];

  if (!config.REDIS_URL) {
    warnings.push(
      'REDIS_URL is unset — graph state and nutrition lookups will use ' +
        'in-process memory, which does not survive a restart and is not shared ' +
        'between replicas.'
    );
  }

  if (!config.FDC_API_KEY) {
    warnings.push(
      'FDC_API_KEY is unset — nutrition will fall back to model estimates and ' +
        'label them low-confidence. A key is free: ' +
        'https://fdc.nal.usda.gov/api-key-signup.html'
    );
  }

  return warnings;
};
