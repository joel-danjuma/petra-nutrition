export * from './auth';
export * from './pantry';

import React, { createContext, useContext, ReactNode } from 'react';
import { PetraApiEndpoints, requireApiEndpoints } from '../api';

interface StoreProviderProps {
  /**
   * Defaults to the instance `createPetraClient` registered. Passing one is for
   * tests; an app that built a second instance here would have two clients
   * disagreeing about the session, which is what this used to do.
   */
  api?: PetraApiEndpoints;
  children: ReactNode;
}

const ApiContext = createContext<PetraApiEndpoints | null>(null);

export const StoreProvider: React.FC<StoreProviderProps> = ({ api, children }) => (
  <ApiContext.Provider value={api ?? requireApiEndpoints()}>
    {children}
  </ApiContext.Provider>
);

export const useApi = () => {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used within a StoreProvider');
  return api;
};
