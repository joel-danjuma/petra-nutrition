'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useApi,
  type ApiError,
  type ApiResponse,
  type PetraApiEndpoints,
} from '@petra/shared';

export type QueryStatus = 'loading' | 'success' | 'error';

export interface QueryState<T> {
  data: T | null;
  error: ApiError | null;
  status: QueryStatus;
  /** True when the API refused because the feature is Premium-only. */
  needsPremium: boolean;
  reload: () => void;
  /** Replace the data locally (optimistic updates). */
  setData: (update: (prev: T | null) => T | null) => void;
}

const toApiError = (e: unknown): ApiError =>
  e && typeof e === 'object' && 'code' in e && 'message' in e
    ? (e as ApiError)
    : ({
        code: 'NETWORK_ERROR',
        message: e instanceof Error ? e.message : 'Something went wrong',
        timestamp: new Date().toISOString(),
      } as ApiError);

/**
 * Load one thing from the API for a screen, through the shared typed client
 * (which carries the session token — the old screens read it out of
 * localStorage by hand).
 *
 * `deps` work like an effect's: change one and the query re-runs. A response
 * that arrives after a newer request has started is dropped.
 */
export function useApiQuery<T>(
  fetcher: (api: PetraApiEndpoints) => Promise<ApiResponse<T>>,
  deps: ReadonlyArray<unknown> = []
): QueryState<T> {
  const api = useApi();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [status, setStatus] = useState<QueryStatus>('loading');
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);

  // The fetcher is usually an inline arrow; keep the latest without making it
  // a dependency, so callers do not need useCallback.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Compare dependencies by value so callers can pass a fresh array literal
  // each render, as with an effect's dependency list.
  const depKey = JSON.stringify(deps);

  useEffect(() => {
    const id = ++seq.current;
    setStatus('loading');
    setError(null);
    fetcherRef
      .current(api)
      .then(res => {
        if (id !== seq.current) return;
        if (res.success) {
          setData(res.data ?? null);
          setStatus('success');
        } else {
          setError(toApiError(res.error));
          setStatus('error');
        }
      })
      .catch(e => {
        if (id !== seq.current) return;
        setError(toApiError(e));
        setStatus('error');
      });
  }, [api, nonce, depKey]);

  const reload = useCallback(() => setNonce(n => n + 1), []);
  const update = useCallback(
    (fn: (prev: T | null) => T | null) => setData(prev => fn(prev)),
    []
  );

  return {
    data,
    error,
    status,
    needsPremium: error?.code === 'PREMIUM_REQUIRED',
    reload,
    setData: update,
  };
}
