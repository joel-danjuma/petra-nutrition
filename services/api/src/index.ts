import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'http';
import { setupMiddleware } from './middleware';
import { setupRoutes } from './routes';
import { connectDatabase } from './database';
import { setupRedis } from './config/redis';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/error';
import { config, isProduction } from './config';
import { agentClient } from './services/agent-client';

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

    // Probe the agent before serving. Chat, meal-plan generation and the pantry
    // scan all depend on it, and a misconfigured AGENT_URL otherwise surfaces
    // as exactly those three features failing while everything else works —
    // a confusing shape for what is really a deploy problem. The resolved URL
    // is logged because that string is the thing you actually need to see.
    logger.info(`Agent URL: ${config.AGENT_URL}`);
    const agentHealth = await agentClient.health();

    if (agentHealth.ok) {
      logger.info('Agent reachable', agentHealth.detail as object);
    } else if (isProduction) {
      throw new Error(
        `Agent is not reachable at ${config.AGENT_URL}. ` +
          'Chat, meal-plan generation and the pantry scan would all fail.'
      );
    } else {
      logger.warn(
        `Agent is NOT reachable at ${config.AGENT_URL}. Start it with ` +
          '`pnpm run dev:agent`. Everything except AI features will work.'
      );
    }

    // Setup middleware
    setupMiddleware(app);
    logger.info('Middleware configured');

    // Setup routes
    setupRoutes(app);
    logger.info('Routes configured');

    // Health check endpoint. Reports the agent as a dependency so "is the
    // assistant up?" is one curl against the gateway rather than a question
    // about a service that has no public address.
    app.get('/health', async (req, res) => {
      const agent = await agentClient.health();

      res.status(agent.ok ? 200 : 503).json({
        status: agent.ok ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        services: {
          database: 'up',
          redis: 'up',
          agent: agent.ok ? 'up' : 'down',
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

    // Global error handler.
    //
    // This used to be an inline handler reading `error.status`, but every
    // error class in middleware/error.ts sets `statusCode` — so a thrown
    // ValidationError went out as HTTP 500 carrying a VALIDATION_ERROR body,
    // and the premium gate looked like a server crash to the client rather
    // than a condition worth showing an upgrade prompt for. The real handler
    // was already written and exported; it just was never mounted, and it
    // also maps Prisma, Multer and JWT errors properly.
    app.use(errorHandler);

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
