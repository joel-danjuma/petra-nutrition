'use client';

import { ReactNode, useEffect } from 'react';
import { ApiClient } from '@petra/shared';
import { StoreProvider, initializeStores } from '@petra/shared';

interface ApiProviderProps {
  children: ReactNode;
}

export function ApiProvider({ children }: ApiProviderProps) {
  const apiClient = new ApiClient({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
    timeout: 30000,
    onTokenExpired: () => {
      // Handle token expiration - redirect to login or refresh token
      window.location.href = '/auth/login';
    },
    onUnauthorized: () => {
      // Handle unauthorized access
      window.location.href = '/auth/login';
    },
  });

  useEffect(() => {
    // Initialize stores with API client
    initializeStores(apiClient);
  }, [apiClient]);

  return (
    <StoreProvider apiClient={apiClient}>
      {children}
    </StoreProvider>
  );
}
