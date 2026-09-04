import { createErrorHandler } from '@petra/service-kit';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * The API's error semantics.
 *
 * The implementation lives in `@petra/service-kit` so that the API and the
 * agent cannot drift apart on what an error looks like on the wire. That
 * matters more than it sounds: this file previously carried its own handler
 * whose classes set `statusCode` while a second, inline handler in index.ts
 * read `status` — so every operational error went out as a 500 carrying the
 * correct code in its body, and the premium gate looked like a server crash.
 * One implementation, shared, is the fix that stays fixed.
 *
 * The error classes are re-exported here so the ~40 call sites that import
 * `NotFoundError` and friends from `../middleware/error` keep working.
 */
export type { AppError } from '@petra/service-kit';

export {
  CustomError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServiceUnavailableError,
  UpstreamUnavailableError,
  asyncHandler,
  notFoundHandler,
} from '@petra/service-kit';

export const errorHandler = createErrorHandler({
  logger,
  nodeEnv: config.NODE_ENV,
});
