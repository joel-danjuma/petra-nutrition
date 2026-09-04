import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera } from 'lucide-react-native';
import { router } from 'expo-router';
import type { PermissionResponse } from 'expo-camera';

import { color, space } from '../theme';
import { Button } from './ui/Button';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { Text } from './ui/Text';

/**
 * Shared permission gate for the two scan screens, which previously carried
 * near-identical copies of this markup.
 *
 * Renders on the white canvas rather than over the camera, because there is no
 * camera feed to sit on until permission is granted.
 */
export function CameraPermissionGate({
  permission,
  requestPermission,
  reason,
  children,
}: {
  permission: PermissionResponse | null;
  requestPermission: () => void;
  reason: string;
  children: React.ReactNode;
}) {
  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <LoadingSpinner size="large" />
          <Text preset="bodyMd" align="center">
            Requesting camera permission
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Camera size={40} color={color.muted} strokeWidth={1.5} />
          <Text preset="titleMd" align="center">
            Camera access needed
          </Text>
          <Text preset="bodyMd" align="center">
            {reason}
          </Text>
          <Button onPress={requestPermission} style={styles.cta}>
            Grant permission
          </Button>
          <Button variant="secondary" onPress={() => router.replace('/pantry/add')}>
            Add manually instead
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.canvas },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.xxl,
    gap: space.sm,
  },
  cta: { marginTop: space.sm },
});
