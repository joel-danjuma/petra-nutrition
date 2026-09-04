import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';

import { color, radius, space } from '../../theme';
import { Text } from './Text';

/**
 * A small selectable or informational tag — filter categories, diet
 * preferences, recipe metadata.
 *
 * Deliberately NOT pill-shaped. `--radius-pill` is a pricing sub-system signal
 * in this design system, so chips take `--radius-sm` (the "small inline
 * button" radius) to avoid reading as a pricing control.
 */
export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Render on a dark surface (Cook Mode, Scan). */
  onDark?: boolean;
  style?: ViewStyle;
}

export function Chip({ label, selected = false, onPress, onDark = false, style }: ChipProps) {
  const surface: ViewStyle = selected
    ? { backgroundColor: color.ink, borderColor: color.ink }
    : onDark
      ? { backgroundColor: 'transparent', borderColor: color.borderStrong }
      : { backgroundColor: color.canvas, borderColor: color.hairline };

  const labelColor = selected ? color.white : onDark ? color.white : color.ink;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected } : undefined}
      style={[styles.base, surface, style]}
    >
      <Text preset="caption" color={labelColor}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    alignSelf: 'flex-start',
  },
});
