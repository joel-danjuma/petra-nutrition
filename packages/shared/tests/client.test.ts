import {
  ApiClient,
  type FetchInit,
  type FetchLike,
  type FetchResponseLike,
} from '../src/api/client';
import { PetraApiEndpoints } from '../src/api/endpoints';
import { ApiError, errorMessage, isPremiumRequired } from '../src/api/errors';

const BASE = 'http://api.test/api';

interface Call {
  url: string;
  init: FetchInit;
}

const respond = (status: number, body: unknown): FetchResponseLike => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get: name =>
      name.toLowerCase() === 'content-type' ? 'application/json' : null,
  },
  body: null,
  text: async () => (body === undefined ? '' : JSON.stringify(body)),
});

/**
 * A fake transport: each request is answered by `route`, and every call is
 * recorded so the test can check what actually went over the wire.
 */
const fakeFetch = (route: (call: Call) => FetchResponseLike) => {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const call = { url, init };
    calls.push(call);
    return route(call);
  };
  return { calls, fetchImpl };
};

const ok = (data: unknown) => respond(200, { success: true, data });

const unauthorized = () =>
  respond(401, {
    success: false,
    error: { code: 'TOKEN_INVALID', message: 'Invalid token' },
  });

const bearer = (call: Call) => call.init.headers.Authorization;

/** What a call rejected with; fails the test if it resolved instead. */
const rejection = async (call: Promise<unknown>): Promise<ApiError> => {
  try {
    await call;
  } catch (err) {
    return err as ApiError;
  }
  throw new Error('Expected the call to reject');
};

describe('ApiClient', () => {
  it('unwraps the response envelope to its data', async () => {
    const { calls, fetchImpl } = fakeFetch(() =>
      ok({ items: [{ id: 'p1' }], total: 1 })
    );
    const client = new ApiClient({
      baseUrl: BASE,
      fetchImpl,
      getToken: () => 'tok',
    });

    const result = await client.get<{ items: { id: string }[] }>('/pantry', {
      params: { limit: 100, tags: ['a', 'b'], skip: undefined },
    });

    expect(result).toEqual({ items: [{ id: 'p1' }], total: 1 });
    expect(calls[0].url).toBe(`${BASE}/pantry?limit=100&tags=a&tags=b`);
    expect(bearer(calls[0])).toBe('Bearer tok');
  });

  it('sends a JSON body with its content type', async () => {
    const { calls, fetchImpl } = fakeFetch(() => ok({ id: 'r1' }));
    const client = new ApiClient({ baseUrl: BASE, fetchImpl });

    await client.post('/recipes/generated', { recipe: { title: 'Soup' } });

    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers['Content-Type']).toBe('application/json');
    expect(calls[0].init.body).toBe('{"recipe":{"title":"Soup"}}');
    // No session: no Authorization header at all, not "Bearer null".
    expect(bearer(calls[0])).toBeUndefined();
  });

  it('normalises an error envelope, details array included', async () => {
    const { fetchImpl } = fakeFetch(() =>
      respond(400, {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [
            { field: 'expirationDate', message: 'must be a future date' },
            { field: 'quantity', message: 'must be positive', value: -1 },
          ],
          timestamp: '2026-10-25T00:00:00.000Z',
        },
      })
    );
    const client = new ApiClient({ baseUrl: BASE, fetchImpl });

    const err = await rejection(client.post('/pantry', {}));

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.status).toBe(400);
    expect(err.details).toEqual([
      { field: 'expirationDate', message: 'must be a future date' },
      { field: 'quantity', message: 'must be positive', value: -1 },
    ]);
    // The field messages, not the useless "Validation failed".
    expect(errorMessage(err)).toBe('must be a future date\nmust be positive');
  });

  it('still produces an ApiError from a body that is not an envelope', async () => {
    const { fetchImpl } = fakeFetch(() => ({
      ...respond(502, undefined),
      headers: { get: () => 'text/html' },
      text: async () => '<html>Bad gateway</html>',
    }));
    const client = new ApiClient({ baseUrl: BASE, fetchImpl });

    const err = await rejection(client.get('/pantry'));

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
    expect(err.details).toEqual([]);
    expect(err.message).toBe('Request failed (502)');
  });

  it('turns a transport failure into a NETWORK_ERROR', async () => {
    const client = new ApiClient({
      baseUrl: BASE,
      fetchImpl: async () => {
        throw new TypeError('Network request failed');
      },
    });

    const err = await rejection(client.get('/pantry'));

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.status).toBe(0);
    expect(errorMessage(err)).toMatch(/cannot be reached/);
  });

  it('on a 401, refreshes once and retries with the new token', async () => {
    let token = 'stale';
    const { calls, fetchImpl } = fakeFetch(call =>
      bearer(call) === 'Bearer fresh' ? ok({ id: 'u1' }) : unauthorized()
    );
    const refresh = jest.fn(async () => {
      token = 'fresh';
      return token;
    });
    const onSignedOut = jest.fn();
    const client = new ApiClient({
      baseUrl: BASE,
      fetchImpl,
      getToken: () => token,
      refresh,
      onSignedOut,
    });

    await expect(client.get('/users/profile')).resolves.toEqual({ id: 'u1' });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls.map(bearer)).toEqual(['Bearer stale', 'Bearer fresh']);
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it('shares one refresh between requests that fail together', async () => {
    let token = 'stale';
    const { calls, fetchImpl } = fakeFetch(call =>
      bearer(call) === 'Bearer fresh' ? ok(call.url) : unauthorized()
    );
    const refresh = jest.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      token = 'fresh';
      return token;
    });
    const client = new ApiClient({
      baseUrl: BASE,
      fetchImpl,
      getToken: () => token,
      refresh,
    });

    const results = await Promise.all([
      client.get('/pantry'),
      client.get('/meal-plans'),
      client.get('/analytics/waste-summary'),
    ]);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      `${BASE}/pantry`,
      `${BASE}/meal-plans`,
      `${BASE}/analytics/waste-summary`,
    ]);
    expect(calls).toHaveLength(6);
  });

  it('when the refresh fails, calls onSignedOut exactly once', async () => {
    const { calls, fetchImpl } = fakeFetch(() => unauthorized());
    const refresh = jest.fn(async (): Promise<string | null> => {
      throw new ApiError('TOKEN_INVALID', 'Invalid refresh token', 401);
    });
    const onSignedOut = jest.fn();
    const client = new ApiClient({
      baseUrl: BASE,
      fetchImpl,
      getToken: () => 'stale',
      refresh,
      onSignedOut,
    });

    const errors = await Promise.all([
      rejection(client.get('/pantry')),
      rejection(client.get('/meal-plans')),
    ]);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onSignedOut).toHaveBeenCalledTimes(1);
    // The caller sees the original refusal, not the refresh's.
    for (const err of errors) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(401);
    }
    // Nothing was retried with a token that was never issued.
    expect(calls).toHaveLength(2);

    // A later request on the same dead session does not sign out again.
    await client.get('/pantry').catch(() => undefined);
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('signs out when the retried request is refused as well', async () => {
    let token = 'stale';
    const { calls, fetchImpl } = fakeFetch(() => unauthorized());
    const onSignedOut = jest.fn();
    const client = new ApiClient({
      baseUrl: BASE,
      fetchImpl,
      getToken: () => token,
      refresh: async () => {
        token = 'fresh';
        return token;
      },
      onSignedOut,
    });

    const err = await rejection(client.get('/pantry'));

    expect(err.status).toBe(401);
    expect(calls).toHaveLength(2);
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('does not refresh for an anonymous call, or one without a session', async () => {
    const { fetchImpl } = fakeFetch(() => unauthorized());
    const refresh = jest.fn(async () => 'fresh');
    const onSignedOut = jest.fn();
    let token: string | null = 'tok';
    const client = new ApiClient({
      baseUrl: BASE,
      fetchImpl,
      getToken: () => token,
      refresh,
      onSignedOut,
    });

    // Wrong password: a 401 that has nothing to do with the session.
    await expect(
      client.post('/auth/login', {}, { anonymous: true })
    ).rejects.toBeInstanceOf(ApiError);

    token = null;
    await expect(client.get('/pantry')).rejects.toBeInstanceOf(ApiError);

    expect(refresh).not.toHaveBeenCalled();
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it('hands back the unread response for streaming', async () => {
    const { calls, fetchImpl } = fakeFetch(() => ({
      ...respond(200, undefined),
      headers: { get: () => 'text/event-stream' },
      text: async () => 'event: done\ndata: {}\n\n',
    }));
    const client = new ApiClient({
      baseUrl: BASE,
      fetchImpl,
      getToken: () => 'tok',
    });
    const api = new PetraApiEndpoints(client);

    const res = await api.chat.stream({ sessionId: 's1', message: 'hi' });

    expect(await res.text()).toBe('event: done\ndata: {}\n\n');
    expect(calls[0].url).toBe(`${BASE}/chat/stream`);
    expect(calls[0].init.headers.Accept).toBe('text/event-stream');
    expect(bearer(calls[0])).toBe('Bearer tok');
  });
});

describe('endpoints', () => {
  it('posts the refresh token in the body, without the stale bearer', async () => {
    const { calls, fetchImpl } = fakeFetch(() =>
      ok({ user: { id: 'u1' }, token: 't2', refreshToken: 'r2' })
    );
    const api = new PetraApiEndpoints(
      new ApiClient({ baseUrl: BASE, fetchImpl, getToken: () => 'stale' })
    );

    const session = await api.auth.refreshToken('r1');

    expect(session.token).toBe('t2');
    expect(calls[0].url).toBe(`${BASE}/auth/refresh`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      refreshToken: 'r1',
    });
    expect(bearer(calls[0])).toBeUndefined();
  });
});

describe('isPremiumRequired', () => {
  it('is true only for the API refusing a Premium feature', async () => {
    const { fetchImpl } = fakeFetch(() =>
      respond(403, {
        success: false,
        error: {
          code: 'PREMIUM_REQUIRED',
          message: 'This feature requires a Premium subscription',
        },
      })
    );
    const client = new ApiClient({ baseUrl: BASE, fetchImpl });

    const err = await rejection(client.get('/pantry'));

    expect(isPremiumRequired(err)).toBe(true);
    expect(err.status).toBe(403);
    expect(isPremiumRequired(new ApiError('VALIDATION_ERROR', 'x', 400))).toBe(
      false
    );
    expect(isPremiumRequired({ code: 'PREMIUM_REQUIRED' })).toBe(false);
    expect(isPremiumRequired(null)).toBe(false);
  });
});

describe('errorMessage', () => {
  it('reads a plain Error, and falls back for anything else', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('nope', 'Try again')).toBe('Try again');
    expect(errorMessage(new ApiError('NOT_FOUND', 'Recipe not found', 404))).toBe(
      'Recipe not found'
    );
  });
});
