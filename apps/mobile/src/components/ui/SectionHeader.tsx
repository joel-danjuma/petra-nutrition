import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { color, space } from '../../theme';
import { Text } from './Text';

/**
 * The small uppercase label that opens a section ("Today so far", "Diet and
 * allergies").
 *
 * Uppercase is the one casing exception the system allows — it documents
 * sentence case everywhere except small category tags, which is exactly this.
 */
export interface SectionHeaderProps {
  title: string;
  /** Optional right-hand affordance, e.g. "See all". */
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text preset="caption" color={color.muted} style={styles.title}>
        {title.toUpperCase()}
      </Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button">
          {/* Inline affordance, so it takes the link colour rather than ink. */}
          <Text preset="caption" color={color.link}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  title: { letterSpacing: 1.2 },
});
