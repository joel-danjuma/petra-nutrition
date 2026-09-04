import { createLogger, logRequest as kitLogRequest } from '@petra/service-kit';
import { config } from '../config';

/**
 * The agent's logger instance. Call sites import from here rather than from
 * `@petra/service-kit` directly, so the binding to this service's config
 * happens exactly once.
 */
export const logger = createLogger({
  level: config.LOG_LEVEL,
  nodeEnv: config.NODE_ENV,
  filePath: config.LOG_FILE_PATH,
  service: config.SERVICE_NAME,
});

export const logRequest = (req: unknown, res: unknown, responseTime?: number) =>
  kitLogRequest(logger, req, res, responseTime);
