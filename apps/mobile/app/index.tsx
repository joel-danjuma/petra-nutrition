import { Redirect } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@petra/shared';

import { color } from '../src/theme';
import { LoadingSpinner } from '../src/components/ui/LoadingSpinner';

export default function IndexScreen() {
  const { user, isAuthenticated, isLoading, hasHydrated } = useAuth();

  // Wait for the persisted session to load before deciding where to send the
  // user — otherwise a signed-in user gets bounced to /auth on every launch.
  if (!hasHydrated || isLoading) {
    return (
      <View style={styles.container}>
        <LoadingSpinner size="large" />
      </View>
    );
  }

  if (isAuthenticated) {
    if (!user?.profile?.onboardingCompletedAt) {
      return <Redirect href="/onboarding" />;
    }
    return <Redirect href="/(tabs)" />;
  }
  return <Redirect href="/auth" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: color.canvas,
  },
});
