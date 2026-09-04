import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Plus } from 'lucide-react-native';

import { color, radius, shadow, space } from '../theme';

interface FloatingActionButtonProps {
  onPress: () => void;
  icon?: React.ReactNode;
  label?: string;
  style?: ViewStyle;
  disabled?: boolean;
}

/**
 * The pantry's floating Scan action.
 *
 * Carries the primary CTA's rest shadow — the only shadow the system defines —
 * rather than the heavy drop it used to have. It is a primary action, so it
 * takes the near-black surface and darkens on press.
 */
export function FloatingActionButton({
  onPress,
  icon,
  label,
  style,
  disabled = false,
}: FloatingActionButtonProps) {
  const handlePress = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? 'Add'}
      accessibilityState={{ disabled }}
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: disabled
            ? color.borderStrong
            : pressed
              ? color.primaryActive
              : color.ink,
        },
        shadow.buttonRest,
        style,
      ]}
    >
      {icon ?? <Plus size={22} color={color.white} strokeWidth={1.85} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: space.lg,
    right: space.lg,
    width: space.xxl,
    height: space.xxl,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
