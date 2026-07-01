import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'http';
import { setupMiddleware } from './middleware';
import { setupRoutes } from './routes';
import { connectDatabase } from './database';
import { setupRedis } from './config/redis';
import { logger } from './utils/logger';
import { config } from './config';

// Load environment variables
dotenv.config();

async function startServer() {
  try {
    // Create Express app
    const app = express();
    const server = createServer(app);

    // Connect to database
    await connectDatabase();
    logger.info('Database connected successfully');

    // Setup Redis
    await setupRedis();
    logger.info('Redis connected successfully');

    // Setup middleware
    setupMiddleware(app);
    logger.info('Middleware configured');

    // Setup routes
    setupRoutes(app);
    logger.info('Routes configured');

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        services: {
          database: 'up',
          redis: 'up',
        },
        uptime: process.uptime(),
      });
    });

    // 404 handler
    app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'The requested resource was not found',
          timestamp: new Date().toISOString(),
          path: req.originalUrl,
        },
      });
    });

    // Global error handler
    app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error:', error);

      // Don't send error details in production
      const isDevelopment = config.NODE_ENV === 'development';

      res.status(error.status || 500).json({
        success: false,
        error: {
          code: error.code || 'INTERNAL_ERROR',
          message: error.message || 'Internal server error',
          timestamp: new Date().toISOString(),
          path: req.originalUrl,
          ...(isDevelopment && { stack: error.stack }),
        },
      });
    });

    // Start server
    const port = config.PORT;
    server.listen(port, () => {
      logger.info(`🚀 Petra AI Backend running on port ${port}`);
      logger.info(`📊 Health check available at http://localhost:${port}/health`);
      logger.info(`🌍 Environment: ${config.NODE_ENV}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
