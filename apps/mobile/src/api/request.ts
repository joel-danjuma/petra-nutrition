import { useAuthStore } from '@petra/shared';

import { API_URL } from '../config/api';

/**
 * A request that actually fails when the server says it failed.
 *
 * `fetch` resolves for a 400 as readily as a 200, so a screen that only catches
 * rejections never learns about a rejected write. That is not hypothetical
 * here: the shopping list sent a body the API has never accepted, every call
 * came back 400, the optimistic tick was never reverted and nothing was shown.
 * The user tapped the same row 52 times because the app looked like it worked.
 *
 * Kept deliberately small, and adopted only by the screens this change touches.
 * Converting the app's other raw `fetch` calls is a separate job.
 */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** The API's code, for example PREMIUM_REQUIRED or VALIDATION_ERROR. */
    readonly code?: string
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string; details?: { message?: string }[] };
}

/** The useful sentence, which for a validation failure is in `details`. */
const messageFrom = (envelope: ApiEnvelope<unknown> | null, status: number): string => {
  const fieldMessages = (envelope?.error?.details ?? [])
    .map(detail => detail?.message)
    .filter((message): message is string => !!message);

  if (fieldMessages.length) return fieldMessages.join('\n');
  if (envelope?.error?.message) return envelope.error.message;
  return `Request failed (${status})`;
};

/** Just the parts of a fetch call this app makes. Spelled out rather than
 *  reusing the DOM's `RequestInit`, which the repo's lint setup treats as an
 *  undefined global in a TypeScript file. */
interface RequestOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}

export async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  // Read at call time rather than closing over a hook value: a screen that
  // mounted before the session rehydrated would otherwise send a stale token.
  const token = useAuthStore.getState().token;

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    // A body that is not JSON is still a failure if the status says so.
  }

  if (!response.ok || !envelope?.success) {
    throw new ApiRequestError(
      messageFrom(envelope, response.status),
      response.status,
      envelope?.error?.code
    );
  }

  return envelope.data as T;
}
