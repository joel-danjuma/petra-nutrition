export * from './auth';
export * from './pantry';

// Store provider for React apps
import React, { createContext, useContext, ReactNode } from 'react';
import { ApiClient, PetraApiEndpoints } from '../api';

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
  if (!api) {
    throw new Error('useApi must be used within a StoreProvider');
  }
  return api;
};

// Initialize stores with API client
export const initializeStores = (apiClient: ApiClient) => {
  const api = new PetraApiEndpoints(apiClient);
  
  // Inject API into stores
  (window as any).__PETRA_API__ = api;
  
  return api;
};
