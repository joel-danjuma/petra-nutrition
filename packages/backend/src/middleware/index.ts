import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { logger, logRequest } from '../utils/logger';
import { authMiddleware } from './auth';
import { errorHandler } from './error';
import { validationMiddleware } from './validation';

export const setupMiddleware = (app: express.Application): void => {
  // Trust proxy for accurate IP addresses
  app.set('trust proxy', 1);

  // Security middleware
  app.use(helmet({
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
    crossOriginEmbedderPolicy: false,
  }));

  // CORS configuration
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      
      if (config.CORS_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      
      // In development, allow localhost with any port
      if (config.NODE_ENV === 'development' && origin.includes('localhost')) {
        return callback(null, true);
      }
      
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
  }));

  // Compression middleware
  app.use(compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
    level: 6,
    threshold: 1024,
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.RATE_LIMIT_MAX_REQUESTS,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP, please try again later.',
        timestamp: new Date().toISOString(),
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise use IP
      return req.user?.id || req.ip;
    },
  });

  app.use('/api', limiter);

  // Body parsing middleware
  app.use(express.json({ 
    limit: '10mb',
    verify: (req, res, buffer) => {
      // Store raw body for webhook verification
      (req as any).rawBody = buffer;
    }
  }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      logRequest(req, res, duration);
    });
    
    next();
  });

  // Request ID middleware
  app.use((req, res, next) => {
    const requestId = req.headers['x-request-id'] || 
      `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    req.requestId = requestId as string;
    res.setHeader('X-Request-ID', requestId);
    
    next();
  });

  // API version middleware
  app.use('/api', (req, res, next) => {
    res.setHeader('X-API-Version', '1.0');
    next();
  });

  // Health check (before auth middleware)
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
    });
  });

  // Authentication middleware (applied to protected routes)
  app.use('/api', authMiddleware);

  // Validation middleware
  app.use(validationMiddleware);

  // Error handling middleware (should be last)
  app.use(errorHandler);

  logger.info('Middleware setup completed');
};

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: {
        id: string;
        email: string;
        subscriptionTier: string;
        [key: string]: any;
      };
      rawBody?: Buffer;
    }
  }
}
