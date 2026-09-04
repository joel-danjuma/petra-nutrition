import Redis from 'ioredis';
import { config } from './index';
import { logger } from '../utils/logger';

let redisClient: Redis | null = null;

export const setupRedis = async (): Promise<Redis> => {
  try {
    redisClient = new Redis(config.REDIS_URL, {
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });

    // Event listeners
    redisClient.on('connect', () => {
      logger.info('Redis connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis ready');
    });

    redisClient.on('error', (error) => {
      logger.error('Redis error:', error);
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis reconnecting');
    });

    // Connect to Redis
    await redisClient.connect();
    
    // Test connection
    await redisClient.ping();
    
    return redisClient;
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
};

export const getRedisClient = (): Redis => {
  if (!redisClient) {
    throw new Error('Redis client not initialized');
  }
  return redisClient;
};

// Cache utilities
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const client = getRedisClient();
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  },

  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    try {
      const client = getRedisClient();
      const serialized = JSON.stringify(value);
      
      if (ttlSeconds) {
        await client.setex(key, ttlSeconds, serialized);
      } else {
        await client.set(key, serialized);
      }
      
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  },

  async del(key: string): Promise<boolean> {
    try {
      const client = getRedisClient();
      await client.del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  },

  async exists(key: string): Promise<boolean> {
    try {
      const client = getRedisClient();
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  },

  async increment(key: string, ttlSeconds?: number): Promise<number> {
    try {
      const client = getRedisClient();
      const result = await client.incr(key);
      
      if (ttlSeconds && result === 1) {
        await client.expire(key, ttlSeconds);
      }
      
      return result;
    } catch (error) {
      logger.error('Cache increment error:', error);
      return 0;
    }
  },

  async flush(): Promise<boolean> {
    try {
      const client = getRedisClient();
      await client.flushall();
      return true;
    } catch (error) {
      logger.error('Cache flush error:', error);
      return false;
    }
  },
};

// Session utilities
export const session = {
  async create(sessionId: string, data: any, ttlSeconds: number = 86400): Promise<boolean> {
    return cache.set(`session:${sessionId}`, data, ttlSeconds);
  },

  async get<T>(sessionId: string): Promise<T | null> {
    return cache.get<T>(`session:${sessionId}`);
  },

  async update(sessionId: string, data: any, ttlSeconds: number = 86400): Promise<boolean> {
    return cache.set(`session:${sessionId}`, data, ttlSeconds);
  },

  async destroy(sessionId: string): Promise<boolean> {
    return cache.del(`session:${sessionId}`);
  },

  async extend(sessionId: string, ttlSeconds: number = 86400): Promise<boolean> {
    try {
      const client = getRedisClient();
      const result = await client.expire(`session:${sessionId}`, ttlSeconds);
      return result === 1;
    } catch (error) {
      logger.error('Session extend error:', error);
      return false;
    }
  },
};

// Rate limiting utilities
export const rateLimit = {
  async check(key: string, maxRequests: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    try {
      const client = getRedisClient();
      const current = await client.incr(key);
      
      if (current === 1) {
        await client.expire(key, windowSeconds);
      }
      
      const ttl = await client.ttl(key);
      const resetTime = Date.now() + (ttl * 1000);
      
      return {
        allowed: current <= maxRequests,
        remaining: Math.max(0, maxRequests - current),
        resetTime,
      };
    } catch (error) {
      logger.error('Rate limit check error:', error);
      return { allowed: true, remaining: maxRequests, resetTime: Date.now() + (windowSeconds * 1000) };
    }
  },

  async reset(key: string): Promise<boolean> {
    return cache.del(key);
  },
};

// Pub/Sub utilities
export const pubsub = {
  async publish(channel: string, message: any): Promise<boolean> {
    try {
      const client = getRedisClient();
      await client.publish(channel, JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error('Pub/Sub publish error:', error);
      return false;
    }
  },

  subscribe(channel: string, callback: (message: any) => void): Redis {
    const subscriber = new Redis(config.REDIS_URL);
    
    subscriber.subscribe(channel, (error) => {
      if (error) {
        logger.error('Pub/Sub subscribe error:', error);
      } else {
        logger.info(`Subscribed to channel: ${channel}`);
      }
    });

    subscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        try {
          const parsedMessage = JSON.parse(message);
          callback(parsedMessage);
        } catch (error) {
          logger.error('Pub/Sub message parse error:', error);
        }
      }
    });

    return subscriber;
  },
};
