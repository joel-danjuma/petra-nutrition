import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import { createServer } from 'http';
import { createErrorHandler, notFoundHandler } from '@petra/service-kit';

import { config, configWarnings, isProduction, validateConfig } from './config';
import { connectDatabase, disconnectDatabase } from './db';
import { disconnectRedis } from './cache';
import { setupRoutes } from './routes';
import { warmUp } from './retrieval/embedding';
import { logger, logRequest } from './utils/logger';

/**
 * The Petra agent service.
 *
 * Everything inference-shaped lives here: the chat orchestration, hybrid
 * recipe retrieval, the local embedding model, and vision. It holds the model
 * provider keys and nothing else — no JWT secrets, no SMTP, no user tables.
 *
 * It is not reachable from the internet. The API gateway calls it over the
 * private network with a shared key; see middleware/internal-auth.ts.
 */
async function startServer() {
  try {
    // Fail here rather than on the first chat turn: a missing GROQ_API_KEY is a
    // broken deploy, and should look like one.
    validateConfig();
    // Non-fatal gaps are logged once here rather than thrown: chat has to keep
    // working without Redis and without a nutrition-database key.
    for (const warning of configWarnings()) logger.warn(warning);

    const app = express();
    const server = createServer(app);

    const recipeCount = await connectDatabase();

    app.set('trust proxy', 1);
    app.use(helmet());

    // Compression is deliberately not applied to the streaming route: it
    // buffers, and a buffered SSE stream arrives as one lump at the end, which
    // is indistinguishable from no streaming at all.
    app.use(
      compression({
        filter: (req, res) => {
          if (req.path.startsWith('/v1/chat/stream')) return false;
          if (req.headers['x-no-compression']) return false;
          return compression.filter(req, res);
        },
        level: 6,
        threshold: 1024,
      })
    );


    // 16mb because an uploaded pantry photo arrives base64-encoded, and base64
    // inflates by a third — a 10MB upload at the API's cap is ~13.4MB here.
    app.use(express.json({ limit: '16mb' }));

    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => logRequest(req, res, Date.now() - start));
      next();
    });

    // Health is deliberately outside the internal-auth router so the container
    // healthcheck and the API's startup probe can reach it without a key.
    app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        service: config.SERVICE_NAME,
        uptime: process.uptime(),
        checks: {
          database: 'up',
          llm: config.GROQ_API_KEY ? 'configured' : 'missing',
          vision: config.GEMINI_API_KEY ? 'configured' : 'missing',
        },
        recipesIndexed: recipeCount,
        timestamp: new Date().toISOString(),
      });
    });

    setupRoutes(app);

    app.use('*', notFoundHandler);
    app.use(createErrorHandler({ logger, nodeEnv: config.NODE_ENV }));

    server.listen(config.PORT, () => {
      logger.info(`Petra agent running on port ${config.PORT}`);
      logger.info(`Health check at http://localhost:${config.PORT}/health`);
      logger.info(`Environment: ${config.NODE_ENV}`);
      logger.info(
        `Models: fast=${config.GROQ_MODEL_FAST} smart=${config.GROQ_MODEL_SMART}`
      );

      if (!isProduction && !config.INTERNAL_API_KEY) {
        logger.warn(
          'INTERNAL_API_KEY is unset — the agent is accepting unauthenticated ' +
            'calls. Fine locally; it is required in production.'
        );
      }
    });

    // Pull the embedding model into memory now rather than making the first
    // user of the day wait through a cold ONNX load. Failure is not fatal:
    // retrieval degrades to its lexical and pantry-overlap signals.
    warmUp().catch(err =>
      logger.warn('Embedding model warm-up failed; retrieval will run without vectors', err)
    );

    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully`);
      server.close(async () => {
        await Promise.all([disconnectDatabase(), disconnectRedis()]);
        logger.info('Agent stopped');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));

    process.on('uncaughtException', error => {
      logger.error('Uncaught exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start agent:', error);
    process.exit(1);
  }
}

startServer();
