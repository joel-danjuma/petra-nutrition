import type { Request, Response, NextFunction } from 'express';
import type { Logger } from './logger';

/**
 * HTTP error semantics, shared by every Petra service.
 *
 * Two things here are deliberate and were bugs before:
 *
 * 1. Every class sets `statusCode`. A handler that reads `status` will turn
 *    every operational error into a 500 that carries the right code in its
 *    body — which is exactly what happened when the premium gate started
 *    looking like a server crash. There is now one handler and it reads
 *    `statusCode`.
 * 2. Prisma errors are recognised structurally, not with `instanceof`. The API
 *    and the agent generate separate Prisma clients, so their error classes are
 *    different constructors and `instanceof` would silently miss across the
 *    boundary. Matching on `name` and the `P####` code works for both.
 */

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}

export class CustomError extends Error implements AppError {
  statusCode: number;
  code: string;
  isOperational: boolean;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends CustomError {
  details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    // Previously accepted and dropped on the floor, so a validator's field
    // list never reached the client.
    this.details = details;
  }
}

export class AuthenticationError extends CustomError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends CustomError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends CustomError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends CustomError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends CustomError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitError';
  }
}

export class ServiceUnavailableError extends CustomError {
  constructor(service: string) {
    super(`${service} service is currently unavailable`, 503, 'SERVICE_UNAVAILABLE');
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * A dependent service could not be reached at all — distinct from that service
 * reporting a problem of its own. The client can say "the assistant is
 * offline", which is true, instead of "the AI is busy", which would not be.
 */
export class UpstreamUnavailableError extends CustomError {
  constructor(service = 'agent', message?: string) {
    super(
      message || `The ${service} service is not reachable`,
      503,
      'AGENT_UNAVAILABLE'
    );
    this.name = 'UpstreamUnavailableError';
  }
}

interface MappedError {
  statusCode: number;
  code: string;
  message: string;
}

const isPrismaKnownRequestError = (
  error: Error
): error is Error & { code: string; meta?: Record<string, unknown> } =>
  error.name === 'PrismaClientKnownRequestError' &&
  typeof (error as { code?: unknown }).code === 'string';

const handlePrismaError = (error: {
  code: string;
  meta?: Record<string, unknown>;
}): MappedError => {
  switch (error.code) {
    case 'P2002': {
      const target = error.meta?.target as string[] | undefined;
      const field = target?.[0] || 'field';
      return {
        statusCode: 409,
        code: 'DUPLICATE_ENTRY',
        message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`,
      };
    }

    case 'P2025':
      return { statusCode: 404, code: 'NOT_FOUND', message: 'Record not found' };

    case 'P2003':
      return {
        statusCode: 400,
        code: 'INVALID_REFERENCE',
        message: 'Referenced record does not exist',
      };

    case 'P2014':
      return { statusCode: 400, code: 'INVALID_ID', message: 'Invalid ID provided' };

    default:
      return {
        statusCode: 500,
        code: 'DATABASE_ERROR',
        message: 'Database operation failed',
      };
  }
};

const handleMulterError = (error: { code?: string }): MappedError => {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return {
        statusCode: 413,
        code: 'FILE_TOO_LARGE',
        message: 'File size exceeds the maximum allowed limit',
      };

    case 'LIMIT_FILE_COUNT':
      return {
        statusCode: 413,
        code: 'TOO_MANY_FILES',
        message: 'Too many files uploaded',
      };

    case 'LIMIT_UNEXPECTED_FILE':
      return {
        statusCode: 400,
        code: 'UNEXPECTED_FILE',
        message: 'Unexpected file field',
      };

    default:
      return {
        statusCode: 400,
        code: 'FILE_UPLOAD_ERROR',
        message: 'File upload failed',
      };
  }
};

export interface ErrorHandlerOptions {
  logger: Logger;
  /** Stacks and details are only returned outside production. */
  nodeEnv: string;
}

export const createErrorHandler = ({ logger, nodeEnv }: ErrorHandlerOptions) => {
  return (
    error: AppError | Error,
    req: Request,
    res: Response,
    _next: NextFunction
  ): void => {
    let statusCode = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: unknown = undefined;

    if (error instanceof CustomError) {
      statusCode = error.statusCode;
      code = error.code;
      message = error.message;
      details = (error as ValidationError).details;
    } else if (isPrismaKnownRequestError(error)) {
      ({ statusCode, code, message } = handlePrismaError(error));
    } else if (error.name === 'PrismaClientValidationError') {
      statusCode = 400;
      code = 'VALIDATION_ERROR';
      message = 'Invalid data provided';
    } else if (error.name === 'PrismaClientUnknownRequestError') {
      statusCode = 500;
      code = 'DATABASE_ERROR';
      message = 'Database error occurred';
    } else if (error.name === 'MulterError') {
      ({ statusCode, code, message } = handleMulterError(error as { code?: string }));
    } else if (error.name === 'JsonWebTokenError') {
      statusCode = 401;
      code = 'INVALID_TOKEN';
      message = 'Invalid authentication token';
    } else if (error.name === 'TokenExpiredError') {
      statusCode = 401;
      code = 'TOKEN_EXPIRED';
      message = 'Authentication token has expired';
    } else if (error.name === 'SyntaxError' && 'body' in error) {
      statusCode = 400;
      code = 'INVALID_JSON';
      message = 'Invalid JSON in request body';
    }

    const errorInfo = {
      message: error.message,
      stack: error.stack,
      statusCode,
      code,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: (req as { user?: { id?: string } }).user?.id,
      requestId: (req as { requestId?: string }).requestId,
    };

    if (statusCode >= 500) {
      logger.error('Server Error:', errorInfo);
    } else if (statusCode >= 400) {
      logger.warn('Client Error:', errorInfo);
    }

    const errorResponse: Record<string, unknown> = {
      success: false,
      error: {
        code,
        message,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
        requestId: (req as { requestId?: string }).requestId,
        ...(details !== undefined ? { details } : {}),
      },
    };

    if (nodeEnv === 'development') {
      (errorResponse.error as Record<string, unknown>).stack = error.stack;
    }

    res.status(statusCode).json(errorResponse);
  };
};

/** Forwards a rejected promise from an async route handler to Express. */
export const asyncHandler =
  <T extends (req: Request, res: Response, next: NextFunction) => unknown>(fn: T) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'RESOURCE_NOT_FOUND',
      message: `Route ${req.originalUrl} not found`,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
    },
  });
};
