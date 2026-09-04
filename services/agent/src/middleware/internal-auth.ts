import type { Request, Response, NextFunction } from 'express';
import { AGENT_INTERNAL_KEY_HEADER } from '@petra/agent-contract';
import { config, isProduction } from '../config';
import { logger } from '../utils/logger';

/**
 * The agent's only authentication.
 *
 * It never sees a JWT. It is not published through nginx, has no host port in
 * production, and is reachable only from the API on the private network — so
 * the identity of the *user* arrives in the request body, asserted by a gateway
 * that already authenticated them, and the identity of the *caller* is this
 * shared secret.
 *
 * Duplicating `middleware/auth.ts` here would mean two implementations of token
 * verification and blacklisting, and a second service that needs JWT_SECRET.
 * That is a worse trade than a shared key on a closed network.
 */
export const internalAuth = (req: Request, res: Response, next: NextFunction) => {
  // Unauthenticated in development so a local `pnpm dev` and a curl against
  // :3002 both work with no ceremony. `validateConfig` makes the key mandatory
  // in production, so this branch cannot silently disable auth there.
  if (!isProduction && !config.INTERNAL_API_KEY) return next();

  const presented = req.headers[AGENT_INTERNAL_KEY_HEADER];

  if (presented !== config.INTERNAL_API_KEY) {
    logger.warn('Rejected agent call with a bad internal key', {
      path: req.originalUrl,
      ip: req.ip,
    });

    return res.status(401).json({
      success: false,
      error: {
        code: 'INTERNAL_AUTH_FAILED',
        message: 'This service is not directly reachable',
        timestamp: new Date().toISOString(),
      },
    });
  }

  return next();
};
