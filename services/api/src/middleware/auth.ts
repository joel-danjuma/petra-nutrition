import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { dbOperations } from '../database';
import { cache } from '../config/redis';
import { logger } from '../utils/logger';

interface JWTPayload {
  userId: string;
  email: string;
  subscriptionTier: string;
  iat: number;
  exp: number;
}

// Authentication middleware
export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // Skip auth for public routes. Note: this middleware is mounted at
  // `app.use('/api', authMiddleware)`, so Express strips the `/api` prefix
  // from `req.path` here — these entries must be relative to that mount.
  const publicRoutes = [
    '/auth/login',
    '/auth/register',
    '/auth/refresh',
    '/auth/password-reset',
    '/auth/password-reset/confirm',
    '/auth/verify-email',
    '/recipes/search', // Public recipe search
    '/health',
  ];

  const isPublicRoute = publicRoutes.some(route => 
    req.path === route || req.path.startsWith(route + '/')
  );

  if (isPublicRoute) {
    return next();
  }

  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_MISSING',
          message: 'Authorization token is required',
          timestamp: new Date().toISOString(),
        },
      });
    }

    const token = authHeader.substring(7);

    // Check if token is blacklisted
    const isBlacklisted = await cache.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_BLACKLISTED',
          message: 'Token has been revoked',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, config.JWT_SECRET) as JWTPayload;

    // Check if user still exists
    const user = await dbOperations.findUserById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User associated with token not found',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check if user's email is verified (if required)
    if (config.ENABLE_EMAIL_VERIFICATION && !user.isEmailVerified) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Please verify your email address',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Attach user to request object
    req.user = {
      id: user.id,
      email: user.email,
      subscriptionTier: user.subscriptionTier,
      firstName: user.firstName,
      lastName: user.lastName,
      isEmailVerified: user.isEmailVerified,
      profile: user.profile,
    };

    next();
  } catch (error) {
    logger.error('Authentication error:', error);

    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_INVALID',
          message: 'Invalid token',
          timestamp: new Date().toISOString(),
        },
      });
    }

    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Token has expired',
          timestamp: new Date().toISOString(),
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication failed',
        timestamp: new Date().toISOString(),
      },
    });
  }
};

// Premium subscription middleware
export const requirePremium = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
        timestamp: new Date().toISOString(),
      },
    });
  }

  if (req.user.subscriptionTier !== 'PREMIUM') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'PREMIUM_REQUIRED',
        message: 'Premium subscription required for this feature',
        timestamp: new Date().toISOString(),
      },
    });
  }

  next();
};

// Optional authentication middleware (doesn't fail if no token)
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.JWT_SECRET) as JWTPayload;
    
    const user = await dbOperations.findUserById(decoded.userId);
    if (user) {
      req.user = {
        id: user.id,
        email: user.email,
        subscriptionTier: user.subscriptionTier,
        firstName: user.firstName,
        lastName: user.lastName,
        isEmailVerified: user.isEmailVerified,
        profile: user.profile,
      };
    }
  } catch (error) {
    // Silently fail for optional auth
    logger.debug('Optional auth failed:', error);
  }
  
  next();
};

// Generate JWT token
export const generateToken = (payload: Omit<JWTPayload, 'iat' | 'exp'>): string => {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
  });
};

// Generate refresh token
export const generateRefreshToken = (payload: Omit<JWTPayload, 'iat' | 'exp'>): string => {
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN,
  });
};

// Verify refresh token
export const verifyRefreshToken = (token: string): JWTPayload => {
  return jwt.verify(token, config.JWT_REFRESH_SECRET) as JWTPayload;
};

// Blacklist token (for logout)
export const blacklistToken = async (token: string): Promise<void> => {
  try {
    const decoded = jwt.decode(token) as JWTPayload;
    if (decoded && decoded.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await cache.set(`blacklist:${token}`, true, ttl);
      }
    }
  } catch (error) {
    logger.error('Error blacklisting token:', error);
  }
};

// Rate limiting by user
export const userRateLimit = (maxRequests: number, windowMs: number) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next();
    }

    const key = `rate_limit:user:${req.user.id}`;
    const current = await cache.increment(key, Math.floor(windowMs / 1000));

    if (current > maxRequests) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'USER_RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please slow down',
          timestamp: new Date().toISOString(),
        },
      });
    }

    next();
  };
};
