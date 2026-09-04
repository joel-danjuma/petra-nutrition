import React from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';

import { color, radius, space } from '../../theme';

/**
 * A card is defined by its surface colour and radius against the white canvas
 * — never by a shadow or a coloured border. Depth in this system comes from
 * colour contrast, so nothing here casts one.
 *
 * `content` is the everyday 10px card. The signature surfaces (coral / forest /
 * dark / cream) are 12px and full-bleed: they carry white or ink type across
 * the whole card and are never used as small accents or tints.
 */
export type CardSurface =
  | 'content'
  | 'soft'
  | 'coral'
  | 'forest'
  | 'dark'
  | 'cream';

export interface CardProps {
  surface?: CardSurface;
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Signature cards are generously padded; content cards sit tighter. */
  padded?: boolean;
  style?: ViewStyle;
}

const SURFACES: Record<CardSurface, ViewStyle> = {
  content: {
    backgroundColor: color.canvas,
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: radius.md,
  },
  soft: { backgroundColor: color.surfaceSoft, borderRadius: radius.md },
  cream: { backgroundColor: color.cream, borderRadius: radius.md },
  coral: { backgroundColor: color.coral, borderRadius: radius.lg },
  forest: { backgroundColor: color.forest, borderRadius: radius.lg },
  dark: { backgroundColor: color.surfaceDark, borderRadius: radius.lg },
};

/** Type colour that belongs on each surface. */
export const onSurface: Record<CardSurface, string> = {
  content: color.ink,
  soft: color.ink,
  cream: color.ink,
  coral: color.white,
  forest: color.white,
  dark: color.white,
};

export function Card({
  surface = 'content',
  children,
  onPress,
  onLongPress,
  padded = true,
  style,
}: CardProps) {
  if (!onPress && !onLongPress) {
    return <View style={[SURFACES[surface], padded && styles.padded, style]}>{children}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      style={[SURFACES[surface], padded && styles.padded, style]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  padded: { padding: space.md },
});
