'use client';

import { ReactNode } from 'react';
import { ApiClient, StoreProvider, initializeStores } from '@petra/shared';

const apiClient = new ApiClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  timeout: 30000,
  onTokenExpired: () => { window.location.href = '/auth/login'; },
  onUnauthorized: () => { window.location.href = '/auth/login'; },
});

// Initialize once at module load — ensures the API is injected into the
// Zustand store before any component using useAuth() tries to call login/register.
initializeStores(apiClient);

export function ApiProvider({ children }: { children: ReactNode }) {
  return (
    <StoreProvider apiClient={apiClient}>
      {children}
    </StoreProvider>
  );
}
