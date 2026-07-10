export * from './auth';
export * from './pantry';

import React, { createContext, useContext, ReactNode } from 'react';
import { ApiClient, PetraApiEndpoints } from '../api';
import { useAuthStore } from './auth';

interface StoreProviderProps {
  apiClient: ApiClient;
  children: ReactNode;
}

const ApiContext = createContext<PetraApiEndpoints | null>(null);

export const StoreProvider: React.FC<StoreProviderProps> = ({ apiClient, children }) => {
  const api = new PetraApiEndpoints(apiClient);
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
  return api;
};
