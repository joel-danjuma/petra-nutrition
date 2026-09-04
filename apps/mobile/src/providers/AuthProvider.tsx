import React, { ReactNode, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAuth, useAuthStore } from '@petra/shared';

interface AuthProviderProps {
  children: ReactNode;
}

// Extend the shared auth store to use React Native secure storage
export function AuthProvider({ children }: AuthProviderProps) {
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    // Load stored authentication data on app start
    loadStoredAuth();
  }, []);

  useEffect(() => {
    // Save authentication data when it changes
    if (isAuthenticated && user) {
      saveAuthData();
    } else {
      clearAuthData();
    }
  }, [isAuthenticated, user]);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await SecureStore.getItemAsync('auth_token');
      const storedUser = await SecureStore.getItemAsync('user_data');
      
      if (storedToken && storedUser) {
        // Restore authentication state
        // This would typically involve validating the token with the server
        console.log('Restored authentication state');
      }
    } catch (error) {
      console.error('Failed to load stored auth data:', error);
    }
  };

  const saveAuthData = async () => {
    try {
      const { token } = useAuthStore.getState();
      if (token) await SecureStore.setItemAsync('auth_token', token);
      if (user) await SecureStore.setItemAsync('user_data', JSON.stringify(user));
    } catch (error) {
      console.error('Failed to save auth data:', error);
    }
  };

  const clearAuthData = async () => {
    try {
      await SecureStore.deleteItemAsync('auth_token');
      await SecureStore.deleteItemAsync('user_data');
    } catch (error) {
      console.error('Failed to clear auth data:', error);
    }
  };

  return <>{children}</>;
}
