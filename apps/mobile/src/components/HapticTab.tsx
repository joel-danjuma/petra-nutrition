import React from 'react';
import { Pressable } from 'react-native';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';

/**
 * Tab bar button with a light haptic tick on press.
 *
 * `ref` is dropped rather than forwarded: navigation types it against its own
 * button element, which does not match RN's `Pressable` ref, and nothing here
 * needs the handle.
 */
export function HapticTab({ children, onPress, ref: _ref, ...props }: BottomTabBarButtonProps) {
  return (
    <Pressable
      {...props}
      onPress={event => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(event);
      }}
    >
      {children}
    </Pressable>
  );
}
