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

// Inject the API into the store before anything renders, then point auth
// persistence at AsyncStorage and load any saved session.
initializeStores(apiClient);
configureAuthStorage(AsyncStorage);

interface ApiProviderProps {
  children: ReactNode;
}

export function ApiProvider({ children }: ApiProviderProps) {
  return <StoreProvider apiClient={apiClient}>{children}</StoreProvider>;
}
