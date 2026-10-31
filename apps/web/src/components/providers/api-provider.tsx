'use client';

import { ReactNode } from 'react';
import {
  StoreProvider,
  configureAuthStorage,
  createPetraClient,
} from '@petra/shared';

// Created once at module load — ensures the API is registered for the stores
// before any component using useAuth() tries to call login/register.
createPetraClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  // Wrapped: the browser's fetch throws "Illegal invocation" when called as a
  // method of anything but `window`.
  fetchImpl: (url, init) => fetch(url, init),
  // The store is already cleared by now; this only moves the user along.
  // Not when they are already on an auth page, which would reload it.
  onSignedOut: () => {
    if (!window.location.pathname.startsWith('/auth')) {
      window.location.href = '/auth/login';
    }
  },
});

// Guarded for SSR: this module also evaluates on the server during rendering,
// where there is no `localStorage`. In browser-only code this check is safe —
// unlike in shared code, which also runs on React Native.
if (typeof localStorage !== 'undefined') {
  configureAuthStorage(localStorage);
}

export function ApiProvider({ children }: { children: ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}
