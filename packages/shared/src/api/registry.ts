import type { PetraApiEndpoints } from './endpoints';

/**
 * The one API instance the stores call through.
 *
 * It lives here rather than inside a store's state because the stores are not
 * the only thing that needs it, and because state is for data. The previous
 * arrangement injected it into one store with `setState({ api })`, which worked
 * for that store and silently broke every other one: the pantry store read
 * `(get() as any).api`, found `undefined`, and threw before making a single
 * request. Nothing in the app reported that — the pantry simply looked empty
 * and every add failed with a generic message.
 *
 * A module-level holder cannot be half-wired in the same way. One call sets it
 * for every consumer, and a consumer that runs too early gets a message naming
 * the fix rather than an anonymous failure.
 */
let endpoints: PetraApiEndpoints | null = null;

/** Called once by `initializeStores`, before anything renders. */
export const setApiEndpoints = (api: PetraApiEndpoints | null): void => {
  endpoints = api;
};

/** For callers that can sensibly do nothing when the app has not booted yet. */
export const getApiEndpoints = (): PetraApiEndpoints | null => endpoints;

/**
 * For store actions, which cannot. The message names the missing call, because
 * the failure it replaces cost a day to trace.
 */
export const requireApiEndpoints = (): PetraApiEndpoints => {
  if (!endpoints) {
    throw new Error(
      'Petra API is not initialised — call initializeStores(apiClient) at module ' +
        'scope before rendering.'
    );
  }
  return endpoints;
};
