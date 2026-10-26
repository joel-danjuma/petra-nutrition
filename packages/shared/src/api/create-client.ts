import { useAuthStore } from '../store/auth';
import { ApiClient, type FetchLike } from './client';
import { PetraApiEndpoints } from './endpoints';
import { setApiEndpoints } from './registry';

export interface PetraClientConfig {
  baseUrl: string;
  /** Web: omit, or the global `fetch`. Mobile: `fetch` from `expo/fetch`. */
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  /**
   * The session could not be refreshed. By the time this runs the auth store
   * is already cleared; the app only has to move the user to sign-in, if its
   * router does not already do that off `isAuthenticated`.
   */
  onSignedOut?: () => void;
}

/**
 * Build the app's one API client and register it for the stores.
 *
 * Called once, at module scope, by each app's ApiProvider — the web and mobile
 * providers used to be near copies that differed in what they did on a 401
 * (one redirected without clearing the store, the other only logged).
 *
 * The token is read from the auth store on every request, and a 401 is
 * answered by the store's `refreshAuth`. Neither app wires either by hand.
 */
export const createPetraClient = (
  config: PetraClientConfig
): PetraApiEndpoints => {
  const client = new ApiClient({
    baseUrl: config.baseUrl,
    fetchImpl: config.fetchImpl,
    timeoutMs: config.timeoutMs,
    getToken: () => useAuthStore.getState().token,
    refresh: async () => {
      await useAuthStore.getState().refreshAuth();
      return useAuthStore.getState().token;
    },
    onSignedOut: () => {
      useAuthStore.getState().logout();
      config.onSignedOut?.();
    },
  });

  const api = new PetraApiEndpoints(client);
  setApiEndpoints(api);
  return api;
};
