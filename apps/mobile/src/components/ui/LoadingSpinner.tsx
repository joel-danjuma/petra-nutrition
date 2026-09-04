import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useColorScheme } from '../../hooks/useColorScheme';

interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  color?: string;
  style?: any;
}

export function LoadingSpinner({ size = 'small', color, style }: LoadingSpinnerProps) {
  const colorScheme = useColorScheme();
  const defaultColor = color || Colors[colorScheme ?? 'light'].tint;

  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size={size} color={defaultColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
