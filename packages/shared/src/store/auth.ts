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
  // False until the persisted state has been read back from storage. Consumers
  // must wait for this before deciding whether the user is logged out, or they
  // will race an async rehydrate and bounce a signed-in user to the login screen.
  hasHydrated: boolean;
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

// Shared code never guesses which platform it is running on — sniffing globals
// like `window`/`localStorage` is what previously crashed the native app at
// boot (React Native's JS engine defines `window`, but not `localStorage`).
// Instead the store starts with an inert engine that is safe everywhere, and
// each app injects a real one via `configureAuthStorage` (web: `localStorage`,
// mobile: AsyncStorage).
const noopStorage = {
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
  removeItem: () => Promise.resolve(),
};

/**
 * Storage engine accepted by `configureAuthStorage`. Matches both the
 * synchronous web `Storage` API and AsyncStorage's promise-based one.
 */
export interface AuthStorageEngine {
  getItem: (name: string) => string | null | Promise<string | null>;
  setItem: (name: string, value: string) => unknown | Promise<unknown>;
  removeItem: (name: string) => unknown | Promise<unknown>;
}

/**
 * Point the auth store at a real storage engine and load any persisted session.
 * Call this once, at module scope, before the app renders.
 */
export const configureAuthStorage = (storage: AuthStorageEngine) => {
  useAuthStore.persist.setOptions({
    storage: createJSONStorage(() => storage),
  });
  return useAuthStore.persist.rehydrate();
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
      hasHydrated: false,

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
      storage: createJSONStorage(() => noopStorage),
      // Nothing is read until `configureAuthStorage` installs a real engine.
      // Without this, the store would hydrate from `noopStorage` at creation,
      // flip `hasHydrated` to true against empty state, and let the app decide
      // "logged out" while the real read was still in flight.
      skipHydration: true,
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      // Runs after rehydration whether it succeeded or failed — either way the
      // app now knows the real answer and can stop showing its boot spinner.
      onRehydrateStorage: () => () => {
        useAuthStore.setState({ hasHydrated: true });
      },
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
    hasHydrated: store.hasHydrated,
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
