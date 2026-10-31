import React, { ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch } from 'expo/fetch';
import { StoreProvider, configureAuthStorage, createPetraClient } from '@petra/shared';
import { API_URL } from '../config/api';

// Created once at module load, never per-render, and registered for the stores
// before anything renders. This is synchronous and touches no mounted
// component, so module scope is the right place for it.
//
// `expo/fetch` rather than React Native's global fetch: it is the one that can
// hand back a streaming response body, which chat needs.
//
// No `onSignedOut`: the client clears the auth store when a session cannot be
// refreshed, and the root layout's `Stack.Protected` guards already route a
// signed-out user to sign-in off `isAuthenticated`.
createPetraClient({ baseUrl: API_URL, fetchImpl: fetch });

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
  return <StoreProvider>{children}</StoreProvider>;
}
