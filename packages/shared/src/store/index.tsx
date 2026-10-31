export * from './auth';
export * from './pantry';

import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { ApiClient, PetraApiEndpoints, setApiEndpoints } from '../api';
import { useAuthStore } from './auth';

interface StoreProviderProps {
  apiClient: ApiClient;
  children: ReactNode;
}

const ApiContext = createContext<PetraApiEndpoints | null>(null);

export const StoreProvider: React.FC<StoreProviderProps> = ({ apiClient, children }) => {
  const api = useMemo(() => new PetraApiEndpoints(apiClient), [apiClient]);
  return (
    <ApiContext.Provider value={api}>
      {children}
    </ApiContext.Provider>
  );
};

export const useApi = () => {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used within a StoreProvider');
  return api;
};

export const initializeStores = (apiClient: ApiClient) => {
  const api = new PetraApiEndpoints(apiClient);
  // Registered once for every store, rather than injected into one of them.
  // The old `useAuthStore.setState({ api })` reached auth and nothing else, so
  // the pantry store threw before its first request and the pantry looked
  // permanently empty.
  setApiEndpoints(api);

  // The store is the single source of truth for the token; the HTTP client just
  // mirrors it. Covers login, logout and — crucially — rehydrating a persisted
  // session at boot, which otherwise leaves every request unauthenticated.
  let lastToken = useAuthStore.getState().token;
  apiClient.setAuthToken(lastToken);
  useAuthStore.subscribe(state => {
    if (state.token !== lastToken) {
      lastToken = state.token;
      apiClient.setAuthToken(state.token);
    }
  });

  return api;
};
