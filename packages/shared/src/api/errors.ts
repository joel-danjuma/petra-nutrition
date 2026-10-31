import { ApiErrorCode } from '../types/api';

/** One field's complaint from a failed validation. */
export interface ApiErrorDetail {
  field?: string;
  message: string;
  value?: unknown;
}

/**
 * The one error every API call rejects with.
 *
 * There used to be six ways of reading a failure, because the transports
 * rejected with different things: axios with a plain `{ code, message }`
 * object, raw `fetch` not at all (a 400 resolves like a 200), the mobile
 * `request()` helper with its own Error subclass. Each screen then guessed,
 * and a screen that guessed `err instanceof Error` showed "wrong password"
 * when the server was simply down.
 *
 * Now there is one shape. It is a real `Error`, so `instanceof` and
 * `err.message` both work, and it always carries `code`, `status` and
 * `details` — an array, because that is what the API's validation middleware
 * sends (services/api/src/middleware/validation.ts).
 */
export class ApiError extends Error {
  readonly code: string;
  /** HTTP status, or 0 when the request never got an answer. */
  readonly status: number;
  readonly details: ApiErrorDetail[];

  constructor(
    code: string,
    message: string,
    status = 0,
    details: ApiErrorDetail[] = []
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /**
   * From a response the server answered with. `body` is whatever came back —
   * usually the `{ success: false, error }` envelope, but a proxy's HTML error
   * page or an empty body must still produce something readable.
   */
  static fromResponse(status: number, body: unknown): ApiError {
    const wire = envelopeError(body);
    if (wire) {
      return new ApiError(
        wire.code ?? codeForStatus(status),
        wire.message || `Request failed (${status})`,
        status,
        toDetails(wire.details)
      );
    }
    return new ApiError(codeForStatus(status), `Request failed (${status})`, status);
  }
}

interface WireError {
  code?: string;
  message?: string;
  details?: unknown;
}

const envelopeError = (body: unknown): WireError | null => {
  if (typeof body !== 'object' || body === null) return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return null;
  const { code, message, details } = error as Record<string, unknown>;
  return {
    code: typeof code === 'string' ? code : undefined,
    message: typeof message === 'string' ? message : undefined,
    details,
  };
};

/**
 * Normalise `details` to an array. The API sends one for validation failures;
 * anything else (a record, a string) is dropped rather than half-read.
 */
const toDetails = (details: unknown): ApiErrorDetail[] => {
  if (!Array.isArray(details)) return [];
  return details.flatMap(detail => {
    if (typeof detail !== 'object' || detail === null) return [];
    const { field, message, value } = detail as Record<string, unknown>;
    if (typeof message !== 'string' || !message.trim()) return [];
    return [
      {
        field: typeof field === 'string' ? field : undefined,
        message,
        value,
      },
    ];
  });
};

const codeForStatus = (status: number): string => {
  if (status === 401) return ApiErrorCode.TOKEN_INVALID;
  if (status === 404) return ApiErrorCode.RESOURCE_NOT_FOUND;
  if (status === 429) return ApiErrorCode.RATE_LIMIT_EXCEEDED;
  if (status >= 500) return ApiErrorCode.INTERNAL_ERROR;
  return ApiErrorCode.INVALID_INPUT;
};

/**
 * Anything a call can reject with, as an ApiError. Non-API throws (a bug in a
 * screen, a JSON parse failure) keep their message under a generic code.
 */
export const toApiError = (err: unknown): ApiError => {
  if (err instanceof ApiError) return err;
  if (err instanceof Error) {
    return new ApiError(ApiErrorCode.INTERNAL_ERROR, err.message);
  }
  return new ApiError(ApiErrorCode.INTERNAL_ERROR, 'Something went wrong');
};

const UNREACHABLE =
  'Petra cannot be reached right now. Check your connection and try again.';

/**
 * A sentence to show the user, from anything an API call can reject with.
 *
 * A validation failure's useful text is in `details`, one entry per field; its
 * `message` is the useless "Validation failed". A transport failure gets a
 * sentence about the connection, because the raw "Network request failed"
 * reads like the user did something wrong.
 */
export const errorMessage = (
  err: unknown,
  fallback = 'Something went wrong. Please try again.'
): string => {
  if (err instanceof ApiError) {
    if (
      err.code === ApiErrorCode.NETWORK_ERROR ||
      err.code === ApiErrorCode.TIMEOUT_ERROR
    ) {
      return UNREACHABLE;
    }
    const fieldMessages = err.details.map(d => d.message).filter(Boolean);
    if (fieldMessages.length) return fieldMessages.join('\n');
    return err.message.trim() ? err.message : fallback;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
};

/** True when the API refused because the feature is Premium-only. */
export const isPremiumRequired = (err: unknown): boolean =>
  err instanceof ApiError && err.code === ApiErrorCode.PREMIUM_REQUIRED;
