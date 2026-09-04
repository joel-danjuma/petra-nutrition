export * from './auth';
export * from './pantry';

import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { ApiClient, PetraApiEndpoints } from '../api';
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
  // Inject API into Zustand store so auth actions (login/register/etc.) can use it
  useAuthStore.setState({ api } as any);

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
