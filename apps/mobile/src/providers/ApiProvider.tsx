import React, { ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ApiClient,
  StoreProvider,
  configureAuthStorage,
  initializeStores,
} from '@petra/shared';
import { API_URL } from '../config/api';

// Created once at module load, never per-render: a fresh ApiClient on every
// render would hand the store a new, token-less client and silently drop the
// user's session at the HTTP layer.
const apiClient = new ApiClient({
  baseURL: API_URL,
  timeout: 30000,
  onTokenExpired: () => {
    console.log('Token expired - user needs to re-authenticate');
  },
  onUnauthorized: () => {
    console.log('Unauthorized access - redirecting to login');
  },
});

// Inject the API into the store before anything renders. This is synchronous
// and touches no mounted component, so module scope is the right place for it.
initializeStores(apiClient);

let hydrationStarted = false;

/**
 * Point auth persistence at AsyncStorage and load any saved session.
 *
 * Called from an effect in the root layout rather than at module scope. The
 * read is asynchronous, and starting it during module evaluation meant it could
 * resolve while React was still mounting the first tree — React then warns
 * about a state update on a component that has not mounted yet, because the
 * store update arrives mid-mount. Starting it after mount removes the race.
 *
 * Idempotent: Fast Refresh re-runs effects, and rehydrating twice would reset
 * the store from storage under a user who had already signed in.
 */
export function startAuthHydration(): void {
  if (hydrationStarted) return;
  hydrationStarted = true;
  // The store's onRehydrateStorage flips `hasHydrated` whether the read
  // succeeded or failed, so a rejection here is only worth catching to keep it
  // from surfacing as an unhandled promise rejection.
  void Promise.resolve(configureAuthStorage(AsyncStorage)).catch(() => undefined);
}

interface ApiProviderProps {
  children: ReactNode;
}

export function ApiProvider({ children }: ApiProviderProps) {
  return <StoreProvider apiClient={apiClient}>{children}</StoreProvider>;
}
