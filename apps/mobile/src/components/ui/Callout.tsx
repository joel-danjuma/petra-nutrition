import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Leaf, ShieldAlert, TriangleAlert } from 'lucide-react-native';

import { color, radius, space } from '../../theme';
import { Text } from './Text';

/**
 * The advice blocks: "Cook it safe", "Nothing gets binned", and the severe
 * allergy warning.
 *
 * All three are full signature surfaces rather than tinted panels — the design
 * system reserves its brand colours for whole surfaces and never uses them as
 * small accents. Cream carries ink type, coral and forest carry white.
 */
export type CalloutTone = 'safety' | 'zeroWaste' | 'allergy';

const TONES: Record<
  CalloutTone,
  { surface: string; ink: string; Icon: typeof TriangleAlert; defaultTitle: string }
> = {
  safety: {
    surface: color.cream,
    ink: color.ink,
    Icon: TriangleAlert,
    defaultTitle: 'Cook it safe',
  },
  zeroWaste: {
    surface: color.forest,
    ink: color.white,
    Icon: Leaf,
    defaultTitle: 'Nothing gets binned',
  },
  allergy: {
    surface: color.coral,
    ink: color.white,
    Icon: ShieldAlert,
    defaultTitle: 'Severe allergy',
  },
};

export interface CalloutProps {
  tone: CalloutTone;
  title?: string;
  children: string;
  /** Smaller variant for inline use inside another card. */
  compact?: boolean;
}

export function Callout({ tone, title, children, compact = false }: CalloutProps) {
  const { surface, ink, Icon, defaultTitle } = TONES[tone];

  return (
    <View
      style={[styles.container, compact && styles.compact, { backgroundColor: surface }]}
      accessibilityRole="summary"
    >
      <View style={styles.header}>
        <Icon size={18} color={ink} strokeWidth={1.85} />
        <Text preset="titleSm" color={ink}>
          {title ?? defaultTitle}
        </Text>
      </View>
      <Text preset="bodyMd" color={ink} style={styles.body}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: radius.md, padding: space.md, gap: space.xs },
  compact: { padding: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  // Slight opacity on the body keeps the title dominant without a second colour.
  body: { opacity: 0.92 },
});
