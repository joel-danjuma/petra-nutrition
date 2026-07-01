import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User, AuthResponse, Login, CreateUser } from '../types';
import { PetraApiEndpoints } from '../api';

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  login: (credentials: Login) => Promise<void>;
  register: (userData: CreateUser) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  clearError: () => void;
  setUser: (user: User) => void;
}

type AuthStore = AuthState & AuthActions;

// Platform-specific storage
const getStorage = () => {
  if (typeof window !== 'undefined') {
    // Web
    return createJSONStorage(() => localStorage);
  } else {
    // React Native - implement AsyncStorage
    return createJSONStorage(() => ({
      getItem: (key: string) => {
        // Implement AsyncStorage.getItem
        return Promise.resolve(null);
      },
      setItem: (key: string, value: string) => {
        // Implement AsyncStorage.setItem
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        // Implement AsyncStorage.removeItem
        return Promise.resolve();
      },
    }));
  }
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // Actions
      login: async (credentials: Login) => {
        set({ isLoading: true, error: null });
        
        try {
          // This would be injected by the consuming app
          const api = (get() as any).api as PetraApiEndpoints;
          if (!api) {
            throw new Error('API client not initialized');
          }

          const response = await api.auth.login(credentials);
          
          if (response.success && response.data) {
            const { user, token, refreshToken } = response.data;
            
            // Update API client with new token
            api.client.setAuthToken(token);
            
            set({
              user,
              token,
              refreshToken,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
          } else {
            throw new Error(response.error?.message || 'Login failed');
          }
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Login failed',
          });
          throw error;
        }
      },

      register: async (userData: CreateUser) => {
        set({ isLoading: true, error: null });
        
        try {
          const api = (get() as any).api as PetraApiEndpoints;
          if (!api) {
            throw new Error('API client not initialized');
          }

          const response = await api.auth.register(userData);
          
          if (response.success && response.data) {
            const { user, token, refreshToken } = response.data;
            
            api.client.setAuthToken(token);
            
            set({
              user,
              token,
              refreshToken,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
          } else {
            throw new Error(response.error?.message || 'Registration failed');
          }
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Registration failed',
          });
          throw error;
        }
      },

      logout: () => {
        const api = (get() as any).api as PetraApiEndpoints;
        if (api) {
          api.client.setAuthToken(null);
          // Call logout endpoint to invalidate server-side session
          api.auth.logout().catch(() => {
            // Ignore errors on logout
          });
        }

        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null,
        });
      },

      refreshAuth: async () => {
        const { refreshToken } = get();
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        try {
          const api = (get() as any).api as PetraApiEndpoints;
          if (!api) {
            throw new Error('API client not initialized');
          }

          const response = await api.auth.refreshToken();
          
          if (response.success && response.data) {
            const { user, token, refreshToken: newRefreshToken } = response.data;
            
            api.client.setAuthToken(token);
            
            set({
              user,
              token,
              refreshToken: newRefreshToken,
              isAuthenticated: true,
            });
          } else {
            // Refresh failed, logout user
            get().logout();
            throw new Error('Session expired');
          }
        } catch (error: any) {
          get().logout();
          throw error;
        }
      },

      updateProfile: async (updates: Partial<User>) => {
        const { user } = get();
        if (!user) {
          throw new Error('User not authenticated');
        }

        set({ isLoading: true, error: null });

        try {
          const api = (get() as any).api as PetraApiEndpoints;
          if (!api) {
            throw new Error('API client not initialized');
          }

          const response = await api.users.updateProfile(updates);
          
          if (response.success && response.data) {
            set({
              user: response.data,
              isLoading: false,
              error: null,
            });
          } else {
            throw new Error(response.error?.message || 'Profile update failed');
          }
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Profile update failed',
          });
          throw error;
        }
      },

      clearError: () => {
        set({ error: null });
      },

      setUser: (user: User) => {
        set({ user });
      },
    }),
    {
      name: 'auth-storage',
      storage: getStorage(),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Utility hooks
export const useAuth = () => {
  const store = useAuthStore();
  return {
    user: store.user,
    isAuthenticated: store.isAuthenticated,
    isLoading: store.isLoading,
    error: store.error,
    login: store.login,
    register: store.register,
    logout: store.logout,
    updateProfile: store.updateProfile,
    clearError: store.clearError,
  };
};

export const useUser = () => {
  return useAuthStore(state => state.user);
};

export const useIsAuthenticated = () => {
  return useAuthStore(state => state.isAuthenticated);
};
