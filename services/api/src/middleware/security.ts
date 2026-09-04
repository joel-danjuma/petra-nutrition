import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { logger } from '../utils/logger';
import { cache } from '../config/redis';

// Enhanced rate limiting with Redis store
export const createRateLimit = (options: {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: options.message || 'Too many requests from this IP',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    handler: (req: Request, res: Response) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
      });

      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: options.message || 'Too many requests, please try again later',
          timestamp: new Date().toISOString(),
        },
      });
    },
    // Store rate limit data in Redis
    store: {
      incr: async (key: string) => {
        const current = await cache.get(key);
        const count = current ? parseInt(current) + 1 : 1;
        await cache.set(key, count.toString(), options.windowMs / 1000);
        return { totalHits: count, resetTime: new Date(Date.now() + options.windowMs) };
      },
      decrement: async (key: string) => {
        const current = await cache.get(key);
        if (current) {
          const count = Math.max(0, parseInt(current) - 1);
          await cache.set(key, count.toString(), options.windowMs / 1000);
        }
      },
      resetKey: async (key: string) => {
        await cache.del(key);
      },
    } as any,
  });
};

// Security headers with Helmet
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow cross-origin requests for API
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// IP whitelist middleware
export const ipWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (process.env.NODE_ENV === 'development') {
      return next(); // Skip IP filtering in development
    }

    if (!allowedIPs.includes(clientIP as string)) {
      logger.warn('Blocked request from unauthorized IP', {
        ip: clientIP,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'IP_NOT_ALLOWED',
          message: 'Access denied',
          timestamp: new Date().toISOString(),
        },
      });
    }

    next();
  };
};

// Request logging middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  // Log request
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    userId: (req as any).user?.id,
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    const duration = Date.now() - startTime;
    
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length'),
      userId: (req as any).user?.id,
    });

    // Track slow requests
    if (duration > 5000) { // 5 seconds
      logger.warn('Slow request detected', {
        method: req.method,
        url: req.url,
        duration: `${duration}ms`,
        userId: (req as any).user?.id,
      });
    }

    originalEnd.call(this, chunk, encoding);
  };

  next();
};

// Input sanitization middleware
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Basic XSS protection - sanitize string inputs
  const sanitizeString = (str: string): string => {
    return str
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  };

  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          sanitized[key] = sanitizeObject(obj[key]);
        }
      }
      return sanitized;
    }
    
    return obj;
  };

  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }

  next();
};

// Security event logging
export const logSecurityEvent = (
  event: 'LOGIN_ATTEMPT' | 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'TOKEN_REFRESH' | 'UNAUTHORIZED_ACCESS' | 'SUSPICIOUS_ACTIVITY',
  details: Record<string, any>
) => {
  logger.warn('Security event', {
    event,
    timestamp: new Date().toISOString(),
    ...details,
  });

  // Store security events in Redis for analysis
  const eventKey = `security:${event}:${Date.now()}`;
  cache.set(eventKey, JSON.stringify(details), 86400); // Keep for 24 hours
};

// Brute force protection
export const bruteForceProtection = (options: {
  maxAttempts: number;
  windowMs: number;
  blockDuration: number;
}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const identifier = req.ip + ':' + (req.body?.email || 'unknown');
    const key = `brute_force:${identifier}`;

    try {
      const attempts = await cache.get(key);
      const attemptCount = attempts ? parseInt(attempts) : 0;

      if (attemptCount >= options.maxAttempts) {
        logSecurityEvent('SUSPICIOUS_ACTIVITY', {
          type: 'BRUTE_FORCE_DETECTED',
          ip: req.ip,
          email: req.body?.email,
          attempts: attemptCount,
        });

        return res.status(429).json({
          success: false,
          error: {
            code: 'TOO_MANY_ATTEMPTS',
            message: 'Too many failed attempts. Please try again later.',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Store the original end function to intercept response
      const originalSend = res.json;
      res.json = function(body: any) {
        if (body.success === false && body.error?.code === 'INVALID_CREDENTIALS') {
          // Increment failed attempts
          cache.set(key, (attemptCount + 1).toString(), options.blockDuration / 1000);
        } else if (body.success === true) {
          // Clear attempts on successful login
          cache.del(key);
        }

        return originalSend.call(this, body);
      };

      next();
    } catch (error) {
      logger.error('Brute force protection error:', error);
      next(); // Continue on error
    }
  };
};

// API key validation middleware (for external integrations)
export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.header('X-API-Key');

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'API_KEY_REQUIRED',
        message: 'API key is required',
        timestamp: new Date().toISOString(),
      },
    });
  }

  // In production, validate against stored API keys
  const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
  
  if (!validApiKeys.includes(apiKey)) {
    logSecurityEvent('UNAUTHORIZED_ACCESS', {
      type: 'INVALID_API_KEY',
      ip: req.ip,
      apiKey: apiKey.substring(0, 8) + '...',
      path: req.path,
    });

    return res.status(403).json({
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key',
        timestamp: new Date().toISOString(),
      },
    });
  }

  next();
};
