import {
  createLogger,
  logRequest as kitLogRequest,
  logError as kitLogError,
} from '@petra/service-kit';
import { config } from '../config';

/**
 * The API's logger instance.
 *
 * The implementation lives in `@petra/service-kit` so the API and the agent
 * format, level and transport their logs identically. This module exists to
 * bind it to this service's config exactly once — every call site keeps
 * importing `../utils/logger` and never sees the factory.
 */
export const logger = createLogger({
  level: config.LOG_LEVEL,
  nodeEnv: config.NODE_ENV,
  filePath: config.LOG_FILE_PATH,
  service: 'api',
});

export const logRequest = (req: unknown, res: unknown, responseTime?: number) =>
  kitLogRequest(logger, req, res, responseTime);

export const logError = (error: Error, context?: unknown) =>
  kitLogError(logger, error, context);

export const logQuery = (query: string, params?: unknown[], duration?: number) => {
  if (config.NODE_ENV === 'development') {
    logger.debug('Database Query', {
      query,
      params,
      duration: duration ? `${duration}ms` : undefined,
    });
  }
};

export const logAIRequest = (
  service: string,
  operation: string,
  duration?: number,
  tokens?: number
) => {
  logger.info('AI Service Request', {
    service,
    operation,
    duration: duration ? `${duration}ms` : undefined,
    tokens,
  });
};

export const logCacheOperation = (operation: string, key: string, hit?: boolean) => {
  if (config.NODE_ENV === 'development') {
    logger.debug('Cache Operation', { operation, key, hit });
  }
};

/** Stream for morgan HTTP request logging. */
export const morganStream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};
