import { ApiErrorCode } from '../types/api';
import { ApiError } from './errors';

/**
 * The parts of a fetch `Response` the client reads.
 *
 * Structural rather than the DOM's `Response`, so that the browser's `fetch`
 * and `expo/fetch` both satisfy it without a cast — and so a test can hand in
 * a plain object.
 */
export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  /** The unread body, for streaming. Null when the platform cannot stream. */
  readonly body: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}

/** What the client passes to `fetchImpl`. Always a string URL, never a Request. */
export interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body?: string | FormData;
  signal?: AbortSignal;
}

export type FetchLike = (
  url: string,
  init: FetchInit
) => Promise<FetchResponseLike>;

/** Query values. Arrays repeat the key; `undefined` and `null` are left out. */
export type QueryParams = object;

export interface RequestOptions {
  params?: QueryParams;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Overrides the client's default. 0 disables the timeout. */
  timeoutMs?: number;
  /**
   * No bearer token, and no refresh on a 401 — for sign-in, sign-up and the
   * refresh call itself, where a 401 means "wrong credentials", not "expired".
   */
  anonymous?: boolean;
  /**
   * Send the token, but treat a 401 as final. For sign-out: refreshing a
   * session in order to end it would be pointless, and could loop.
   */
  refresh?: boolean;
}

export interface RawRequest extends RequestOptions {
  method?: string;
  body?: unknown;
}

export interface ApiClientConfig {
  baseUrl: string;
  /** Defaults to the global `fetch`. Mobile passes `expo/fetch`. */
  fetchImpl?: FetchLike;
  /** Default 30s. Generation endpoints pass their own. */
  timeoutMs?: number;
  /** Read at call time, so a request never carries a stale token. */
  getToken?: () => string | null;
  /**
   * Exchange the refresh token for a new session; resolve to the new access
   * token, or reject. Called at most once per burst of 401s.
   */
  refresh?: () => Promise<string | null>;
  /** The session is gone and cannot be recovered. Called once per session. */
  onSignedOut?: () => void;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * The one HTTP client both apps talk to the API through.
 *
 * Built on `fetch` with an injectable implementation: the browser's on web,
 * `expo/fetch` on mobile — the one React Native fetch that can stream a
 * response body, which chat needs.
 *
 * Every JSON call resolves to the envelope's `data` and rejects with an
 * `ApiError`. A 401 on an authenticated call triggers one refresh, shared by
 * every request that failed at the same moment, and one retry. If the refresh
 * fails, or the retried request is refused too, `onSignedOut` fires — once.
 *
 * It holds no token of its own. The previous client kept a copy that the auth
 * store pushed into it from five places; a session restored at boot reached
 * the store but not the copy, and every request went out unauthenticated.
 */
export class ApiClient {
  readonly baseUrl: string;
  private readonly config: ApiClientConfig;
  private readonly fetchImpl: FetchLike;
  private refreshing: Promise<string | null> | null = null;
  private signedOutToken: string | null = null;

  constructor(config: ApiClientConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    // Wrapped rather than stored bare: a browser's `fetch` called as a method
    // of another object throws "Illegal invocation".
    this.fetchImpl =
      config.fetchImpl ?? ((url, init) => globalThis.fetch(url, init));
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.json<T>('GET', path, undefined, options);
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.json<T>('POST', path, body, options);
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.json<T>('PUT', path, body, options);
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.json<T>('PATCH', path, body, options);
  }

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.json<T>('DELETE', path, undefined, options);
  }

  /** Multipart upload. `fields` that are undefined are left out. */
  upload<T>(
    path: string,
    file: Blob,
    fieldName = 'file',
    fields: Record<string, string | undefined> = {},
    options?: RequestOptions
  ): Promise<T> {
    const form = new FormData();
    form.append(fieldName, file);
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) form.append(key, value);
    }
    return this.json<T>('POST', path, form, options);
  }

  /** A non-JSON body as text — the shopping list's CSV export, for one. */
  async text(path: string, options?: RequestOptions): Promise<string> {
    const response = await this.send('GET', path, undefined, options);
    return readBody(response, options);
  }

  /**
   * The response itself, unread, for callers that stream it.
   *
   * Authenticated and refreshed like any other call, and a non-2xx status
   * still rejects with an ApiError — only a successful body is left for the
   * caller. No timeout unless one is passed: a stream is meant to stay open.
   */
  raw(path: string, request: RawRequest = {}): Promise<FetchResponseLike> {
    const { method = 'GET', body, ...options } = request;
    return this.send(method, path, body, { timeoutMs: 0, ...options });
  }

  /** The absolute URL for a path, with its query string. */
  url(path: string, params?: QueryParams): string {
    const query = params ? toQueryString(params) : '';
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}${query}`;
  }

  private async json<T>(
    method: string,
    path: string,
    body: unknown,
    options?: RequestOptions
  ): Promise<T> {
    // The timeout covers reading the body too, so it is armed here and
    // passed down rather than ending when the headers arrive.
    const timeoutMs = options?.timeoutMs ?? this.config.timeoutMs;
    const timer = startTimer(timeoutMs ?? DEFAULT_TIMEOUT_MS, options?.signal);
    try {
      const response = await this.send(method, path, body, {
        ...options,
        signal: timer.signal,
        timeoutMs: 0,
      });
      const text = await readBody(response, { signal: timer.signal });
      const parsed = parseBody(text, response.headers.get('content-type'));
      return unwrap<T>(response.status, parsed);
    } catch (err) {
      throw timer.translate(err);
    } finally {
      timer.clear();
    }
  }

  /**
   * Send, and on a 401 refresh once and resend. Resolves only for a 2xx;
   * anything else rejects with an ApiError read from the body.
   */
  private async send(
    method: string,
    path: string,
    body: unknown,
    options: RequestOptions = {}
  ): Promise<FetchResponseLike> {
    // Read synchronously, before the first await: signing out reads the token
    // and then clears it, and its logout call must still carry it.
    const token = options.anonymous ? null : this.token();
    const timer = startTimer(options.timeoutMs ?? 0, options.signal);

    try {
      const first = await this.attempt(method, path, body, token, options, timer);
      if (first.status !== 401 || !token || options.refresh === false) {
        return await this.settle(first);
      }

      const fresh = await this.refreshSession(token);
      if (!fresh) return await this.settle(first);

      const second = await this.attempt(method, path, body, fresh, options, timer);
      if (second.status === 401) this.signOut(fresh);
      return await this.settle(second);
    } catch (err) {
      throw timer.translate(err);
    } finally {
      timer.clear();
    }
  }

  private attempt(
    method: string,
    path: string,
    body: unknown,
    token: string | null,
    options: RequestOptions,
    timer: Timer
  ): Promise<FetchResponseLike> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    let payload: string | FormData | undefined;
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      // No Content-Type: the platform writes it, boundary included.
      payload = body;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    Object.assign(headers, options.headers);

    return this.fetchImpl(this.url(path, options.params), {
      method,
      headers,
      body: payload,
      signal: timer.signal,
    });
  }

  /** A 2xx passes through; anything else becomes the ApiError it describes. */
  private async settle(response: FetchResponseLike): Promise<FetchResponseLike> {
    if (response.ok) return response;
    let parsed: unknown = null;
    try {
      parsed = parseBody(await response.text(), response.headers.get('content-type'));
    } catch {
      // An unreadable error body still has a status worth reporting.
    }
    throw ApiError.fromResponse(response.status, parsed);
  }

  private token(): string | null {
    return this.config.getToken?.() ?? null;
  }

  /**
   * One refresh for every request that hit a 401 together, so a screen that
   * fires four calls at once does not spend the refresh token four times —
   * the second exchange would present a token the first already rotated.
   */
  private async refreshSession(staleToken: string): Promise<string | null> {
    // Someone else already refreshed while this request was in flight.
    const current = this.token();
    if (current && current !== staleToken) return current;
    if (!this.config.refresh) {
      this.signOut(staleToken);
      return null;
    }

    if (!this.refreshing) {
      this.refreshing = this.config
        .refresh()
        .catch(() => null)
        .then(token => {
          if (!token) this.signOut(staleToken);
          return token;
        })
        .finally(() => {
          this.refreshing = null;
        });
    }
    return this.refreshing;
  }

  /** At most once per token, however many requests discover it is dead. */
  private signOut(token: string): void {
    if (this.signedOutToken === token) return;
    this.signedOutToken = token;
    this.config.onSignedOut?.();
  }
}

interface Timer {
  signal?: AbortSignal;
  clear(): void;
  /** A timeout or network failure as an ApiError; anything else unchanged. */
  translate(err: unknown): unknown;
}

/**
 * An abort signal that fires on the caller's signal or after `ms`, whichever
 * is first. Without a timeout the caller's signal is used as it is.
 *
 * `clear` stops the clock but leaves the caller's signal connected: for a
 * streamed response the body is still arriving after the call returns, and
 * the caller must still be able to cancel it.
 */
const startTimer = (ms: number, outer?: AbortSignal): Timer => {
  if (!ms) {
    return {
      signal: outer,
      clear: () => undefined,
      translate: translateError(() => false),
    };
  }
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);
  if (outer?.aborted) controller.abort();
  else outer?.addEventListener('abort', () => controller.abort(), { once: true });

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
    translate: translateError(() => timedOut),
  };
};

const translateError =
  (timedOut: () => boolean) =>
  (err: unknown): unknown => {
    // The server answered: that answer stands, even if the clock ran out.
    if (err instanceof ApiError && err.status > 0) return err;
    if (timedOut()) {
      return new ApiError(ApiErrorCode.TIMEOUT_ERROR, 'Request timeout');
    }
    if (err instanceof ApiError) return err;
    // A caller's own abort is theirs to recognise; leave it as it was.
    if (err instanceof Error && err.name === 'AbortError') return err;
    // `fetch` rejects only when no response arrived at all.
    return new ApiError(
      ApiErrorCode.NETWORK_ERROR,
      err instanceof Error && err.message ? err.message : 'Network error occurred'
    );
  };

/** `text()`, but abandoned if the signal fires while the body is arriving. */
const readBody = (
  response: FetchResponseLike,
  options?: { signal?: AbortSignal }
): Promise<string> => {
  const signal = options?.signal;
  if (!signal) return response.text();
  return new Promise<string>((resolve, reject) => {
    const onAbort = () => {
      const err = new Error('The operation was aborted.');
      err.name = 'AbortError';
      reject(err);
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    response.text().then(
      text => {
        signal.removeEventListener('abort', onAbort);
        resolve(text);
      },
      err => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
};

const parseBody = (text: string, contentType: string | null): unknown => {
  if (!text) return null;
  const looksJson =
    contentType?.includes('json') || /^\s*[[{]/.test(text);
  if (!looksJson) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/**
 * The envelope's `data`. A body that is not an envelope (a health check,
 * plain text) is returned as it came; `success: false` on a 2xx is still a
 * failure.
 */
const unwrap = <T>(status: number, body: unknown): T => {
  if (typeof body === 'object' && body !== null && 'success' in body) {
    const envelope = body as { success: unknown; data?: unknown };
    if (envelope.success === false) throw ApiError.fromResponse(status, body);
    return envelope.data as T;
  }
  return body as T;
};

const toQueryString = (params: QueryParams): string => {
  const parts: string[] = [];
  const add = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    const text = value instanceof Date ? value.toISOString() : String(value);
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(text)}`);
  };
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach(v => add(key, v));
    else add(key, value);
  }
  return parts.length ? `?${parts.join('&')}` : '';
};
