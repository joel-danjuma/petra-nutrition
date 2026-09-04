import React from 'react';
import { StyleSheet, View } from 'react-native';

import { color, radius, space } from '../../theme';
import { Text } from './Text';

/**
 * A labelled progress bar — nutrition targets on Today, the shopping-list
 * pick-up count, cook-mode step progress.
 *
 * The fill is ink, not green: progress is not a success state, and signature
 * colours are reserved for full surfaces. The track is the soft surface.
 */
export interface ProgressRowProps {
  label: string;
  /** 0–1. Values outside the range are clamped. */
  value: number;
  /** Right-aligned readout, e.g. "89 / 140 g". */
  readout?: string;
}

export function ProgressRow({ label, value, readout }: ProgressRowProps) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);

  return (
    <View style={styles.row}>
      <Text preset="bodyMd" color={color.ink} style={styles.label}>
        {label}
      </Text>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: pct }}
      >
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      {readout ? (
        <Text preset="caption" style={styles.readout}>
          {readout}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  label: { width: 64 },
  track: {
    flex: 1,
    height: 6,
    borderRadius: radius.xs,
    backgroundColor: color.surfaceStrong,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: color.ink },
  readout: { width: 72, textAlign: 'right' },
});
