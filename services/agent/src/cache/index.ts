import Redis from 'ioredis';

import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * The agent's Redis handle, and the rule that governs it: **nothing here may
 * fail a turn.**
 *
 * Everything the agent keeps in Redis is working memory — graph state for a
 * conversation in progress, and cached nutrition-database rows. The API still
 * owns the durable transcript, and a cold nutrition cache costs a few hundred
 * milliseconds rather than an answer. So every operation swallows its errors
 * and reports a miss, and a Redis outage shows up as slower macros rather than
 * as a chat that refuses to reply. `retrieval/index.ts` already takes this
 * posture with the embedding model; this matches it.
 *
 * `REDIS_URL` unset is a supported configuration, not a degraded one — a local
 * `pnpm dev` needs no Redis running.
 */

let client: Redis | null = null;
let connecting: Promise<Redis | null> | null = null;
/** Set after a failure so a dead Redis is not retried on every single lookup. */
let disabledUntil = 0;

const DISABLE_MS = 30_000;

const disable = (reason: string) => {
  disabledUntil = Date.now() + DISABLE_MS;
  logger.warn(`Redis unavailable, degrading for ${DISABLE_MS / 1000}s`, { reason });
};

/**
 * The connection, or null.
 *
 * `lazyConnect` with `maxRetriesPerRequest: 1` matters: the default ioredis
 * behaviour is to queue commands forever while it reconnects, which turns "the
 * cache is down" into "every chat turn hangs" — the exact failure this whole
 * file exists to prevent.
 */
export async function getRedis(): Promise<Redis | null> {
  if (!config.REDIS_URL) return null;
  if (Date.now() < disabledUntil) return null;
  if (client?.status === 'ready') return client;
  if (connecting) return connecting;

  connecting = (async () => {
    try {
      const next = new Redis(config.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2_000,
        enableOfflineQueue: false,
        retryStrategy: times => (times > 3 ? null : Math.min(times * 200, 1_000)),
      });

      // Errors arrive as events as well as rejections; without a handler an
      // ioredis error event is an unhandled 'error' on an EventEmitter, which
      // takes the process down.
      next.on('error', error => logger.warn('Redis error', { message: error.message }));

      await next.connect();
      await next.ping();

      client = next;
      logger.info('Agent connected to Redis');
      return next;
    } catch (error) {
      disable(error instanceof Error ? error.message : String(error));
      client = null;
      return null;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

/** Read a JSON value. A miss and a failure are the same answer: null. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = await getRedis();
    if (!redis) return null;
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (error) {
    disable(error instanceof Error ? error.message : String(error));
    return null;
  }
}

/** Write a JSON value with a TTL. Returns whether it landed. */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
  try {
    const redis = await getRedis();
    if (!redis) return false;
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
    return true;
  } catch (error) {
    disable(error instanceof Error ? error.message : String(error));
    return false;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
  client = null;
}

/**
 * Cache lifetimes, matching the shape `services/api/src/services/barcode.ts`
 * already uses: a day for a hit, an hour for a miss. A negative result is worth
 * caching — an unmatched ingredient name will not match on the next turn
 * either, and the API it failed against is rate limited.
 */
export const TTL = { hit: 86_400, miss: 3_600 } as const;
