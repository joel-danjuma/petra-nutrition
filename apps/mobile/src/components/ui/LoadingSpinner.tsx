import React from 'react';
import { ActivityIndicator, StyleSheet, View, ViewStyle } from 'react-native';

import { color } from '../../theme';

interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  /** Override for dark surfaces (Cook Mode, Scan). */
  color?: string;
  style?: ViewStyle;
}

export function LoadingSpinner({
  size = 'small',
  color: tint = color.ink,
  style,
}: LoadingSpinnerProps) {
  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size={size} color={tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: 'center', alignItems: 'center' },
});
