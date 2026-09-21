import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
} from '@expo-google-fonts/space-grotesk';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuth } from '@petra/shared';

import { ApiProvider, startAuthHydration } from '../src/providers/ApiProvider';
import { color } from '../src/theme';

// Prevent the splash screen from auto-hiding before asset loading is complete
SplashScreen.preventAutoHideAsync();

/**
 * The auth gate lives here, as route guards rather than as a redirect screen.
 *
 * It used to live in app/index.tsx, which served "/" and redirected. That
 * stopped working: a route group's index serves the same path as the app's own
 * index, so "/" matched both app/index.tsx and app/(tabs)/index.tsx, and the
 * router resolved the tabs first. The gate simply never rendered and every
 * launch landed on the home screen, signed in or not.
 *
 * Guards cannot fail that way. A screen whose guard is false is not registered
 * with the navigator at all, so there is no route to land on, deep link to, or
 * race a redirect against — the router falls back to the first screen that is
 * available, which is exactly the gate's intent stated as structure.
 */
export default function RootLayout() {
  // Space Grotesk carries the whole editorial system; Inter is the pricing
  // dialect. Weights are loaded as separate faces because RN picks a family by
  // name rather than synthesising a weight.
  const [loaded, error] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const { user, isAuthenticated, hasHydrated } = useAuth();

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  // Read the persisted session back. Deliberately after mount: this resolves
  // asynchronously and updates the auth store, which React flags as a mid-mount
  // update if it is started while the first tree is still rendering.
  useEffect(() => {
    startAuthHydration();
  }, []);

  // The persisted session has to be read back before the guards mean anything:
  // deciding while `hasHydrated` is false would register the signed-out stack
  // and bounce a returning user to the login screen on every launch.
  const ready = loaded && hasHydrated;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  const onboarded = Boolean(user?.profile?.onboardingCompletedAt);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.canvas }}>
      <SafeAreaProvider>
        <ApiProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: color.canvas },
            }}
          >
            <Stack.Protected guard={!isAuthenticated}>
              <Stack.Screen name="auth/index" />
            </Stack.Protected>

            <Stack.Protected guard={isAuthenticated && !onboarded}>
              <Stack.Screen name="onboarding/index" />
            </Stack.Protected>

            <Stack.Protected guard={isAuthenticated && onboarded}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="pantry/add" />
              <Stack.Screen name="pantry/scan/camera" />
              <Stack.Screen name="recipes/index" />
              <Stack.Screen name="recipes/[id]" />
              <Stack.Screen name="recipes/[id]/cook" />
              <Stack.Screen name="shopping/index" />
            </Stack.Protected>
          </Stack>
          {/* The system is white-canvas only, so status bar content is always dark. */}
          <StatusBar style="dark" />
          <Toast />
        </ApiProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
