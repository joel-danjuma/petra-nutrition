import React from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { AlertCircle } from 'lucide-react-native';

import { color, radius, semantic, space } from '../../theme';
import { Text } from './Text';

/**
 * A failure the user needs to know about, stated in place.
 *
 * Separate from `Callout`, whose tones are domain-specific — safety, zero
 * waste, allergy — and none of which mean "this did not work". It exists
 * because the screens it is used on had nowhere to put an error: the pantry
 * tab set `error` in its store and rendered "Your pantry is empty" regardless,
 * which reads as an answer rather than a failure.
 *
 * `onRetry` is optional but usually right: an error the reader cannot act on
 * is just an apology.
 */
export interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  style?: ViewStyle;
}

export function ErrorBanner({ message, onRetry, style }: ErrorBannerProps) {
  return (
    <View style={{ ...styles.banner, ...(style ?? {}) }} accessibilityRole="alert">
      <AlertCircle size={16} color={semantic.danger} strokeWidth={1.85} />
      <Text preset="bodyMd" color={color.ink} style={styles.message}>
        {message}
      </Text>
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={8}>
          <Text preset="labelMd" color={color.ink}>
            Try again
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semantic.danger,
    backgroundColor: color.surfaceSoft,
  },
  message: { flex: 1 },
});
