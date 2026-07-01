import React, { ReactNode, useEffect } from 'react';
import { ApiClient, StoreProvider, initializeStores } from '@petra/shared';
import { Platform } from 'react-native';

interface ApiProviderProps {
  children: ReactNode;
}

export function ApiProvider({ children }: ApiProviderProps) {
  // Use different base URLs for different platforms
  const getApiUrl = () => {
    if (__DEV__) {
      // Development URLs
      if (Platform.OS === 'ios') {
        return 'http://localhost:3001/api';
      } else if (Platform.OS === 'android') {
        return 'http://10.0.2.2:3001/api'; // Android emulator
      }
      return 'http://localhost:3001/api';
    }
    
    // Production URL
    return 'https://api.petra-ai.com/api';
  };

  const apiClient = new ApiClient({
    baseURL: getApiUrl(),
    timeout: 30000,
    onTokenExpired: () => {
      // Handle token expiration - could show a modal or redirect to login
      console.log('Token expired - user needs to re-authenticate');
    },
    onUnauthorized: () => {
      // Handle unauthorized access
      console.log('Unauthorized access - redirecting to login');
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
