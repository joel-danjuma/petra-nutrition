/**
 * Reading a message out of whatever was thrown.
 *
 * The shared store re-throws what `ApiClient.transformError` produces, which is
 * a plain object of `{ code, message, timestamp }` rather than an `Error`. So
 * `err instanceof Error` is false and a screen that relies on it falls back to
 * a generic string — which is how "expirationDate must be a future date"
 * reached the user as "Failed to add item. Please try again."
 */
export const errorMessage = (error: unknown, fallback: string): string => {
  if (typeof error !== 'object' || error === null) return fallback;

  // A failed validation puts the useful sentence in `details`, one entry per
  // field, and leaves `message` as the useless "Validation failed". The field
  // message is the one that tells the reader what to change.
  const details = (error as { details?: unknown }).details;
  if (Array.isArray(details)) {
    const fieldMessages = details
      .map(detail =>
        typeof detail === 'object' && detail !== null && 'message' in detail
          ? String((detail as { message?: unknown }).message ?? '')
          : ''
      )
      .filter(Boolean);
    if (fieldMessages.length) return fieldMessages.join('\n');
  }

  const message = (error as { message?: unknown }).message;
  if (typeof message === 'string' && message.trim()) return message;

  return fallback;
};

/** The API's error code, when there is one — for example `PREMIUM_REQUIRED`. */
export const errorCode = (error: unknown): string | undefined => {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
};
