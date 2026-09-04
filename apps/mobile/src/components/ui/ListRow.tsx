import React from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';

import { color, space } from '../../theme';
import { Text } from './Text';

/**
 * One row inside a grouped list — ingredients, shopping items, pantry entries,
 * profile settings. Rows are separated by the system's single hairline; there
 * are no decorative or coloured dividers.
 */
export interface ListRowProps {
  title: string;
  /** Right-aligned secondary value, e.g. a quantity. */
  value?: string;
  /** Secondary line under the title. */
  detail?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  /** Suppress the divider on the final row of a group. */
  last?: boolean;
  /** Dim the row, e.g. a completed shopping item. */
  muted?: boolean;
  style?: ViewStyle;
}

export function ListRow({
  title,
  value,
  detail,
  leading,
  trailing,
  onPress,
  last = false,
  muted = false,
  style,
}: ListRowProps) {
  const body = (
    <View style={[styles.row, !last && styles.divider, muted && styles.muted, style]}>
      {leading ? <View style={styles.slot}>{leading}</View> : null}
      <View style={styles.body}>
        <Text preset="labelMd" color={color.ink}>
          {title}
        </Text>
        {detail ? (
          <Text preset="caption" style={styles.detail}>
            {detail}
          </Text>
        ) : null}
      </View>
      {value ? <Text preset="bodyMd">{value}</Text> : null}
      {trailing ? <View style={styles.slot}>{trailing}</View> : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: color.hairline },
  body: { flex: 1, gap: space.xxs },
  detail: { marginTop: 0 },
  slot: { alignItems: 'center', justifyContent: 'center' },
  muted: { opacity: 0.55 },
});
