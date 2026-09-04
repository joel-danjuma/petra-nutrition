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

import { ApiProvider } from '../src/providers/ApiProvider';
import { color } from '../src/theme';

// Prevent the splash screen from auto-hiding before asset loading is complete
SplashScreen.preventAutoHideAsync();

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

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

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
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="auth/index" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding/index" options={{ headerShown: false }} />
          </Stack>
          {/* The system is white-canvas only, so status bar content is always dark. */}
          <StatusBar style="dark" />
          <Toast />
        </ApiProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
