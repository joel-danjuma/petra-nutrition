import React from 'react';
import { ActivityIndicator, Image, StyleSheet, View, ViewStyle } from 'react-native';
import { ChevronRight, UtensilsCrossed } from 'lucide-react-native';

import { color, radius, space } from '../theme';
import { Card } from './ui/Card';
import { Chip } from './ui/Chip';
import { Text } from './ui/Text';

/**
 * The recipe card, used in three places the mockup calls for it: tonight's hero
 * on Today, the leftovers/Remix tile, and inside the chat stream when Petra
 * recommends something.
 *
 * Imagery is real where we have it. Imported recipes carry photography; an
 * AI-generated one has none, and rather than a grey box it falls back to a
 * typographic plate — which is how the design system's own kit handles the
 * absence of imagery.
 */
export interface RecipeCardSummary {
  id: string;
  title: string;
  imageUrl?: string | null;
  totalTime?: number;
  servings?: number;
  dietaryTags?: string[];
  nutrition?: { calories?: number; protein?: number } | null;
  /** e.g. "6 of 8 in your pantry" */
  pantryMatch?: string;
}

export interface RecipeCardProps {
  recipe: RecipeCardSummary;
  onPress?: () => void;
  /** Overline above the title — "USES 3 EXPIRING ITEMS", "REMIX". */
  badge?: string;
  /** Compact variant for the chat stream and side-by-side tiles. */
  variant?: 'hero' | 'compact';
  /** "Open recipe →" affordance, used in chat. */
  showOpenAffordance?: boolean;
  /**
   * Mid-save. A recipe Petra composed has no row behind it until the first tap
   * writes one, and that write is a round trip — this shows it is happening and
   * drops `onPress` so a second tap cannot start a second write.
   */
  loading?: boolean;
  style?: ViewStyle;
}

/** "35 min · Serves 4 · 520 kcal" — omitting anything we genuinely don't know. */
function metaLine(recipe: RecipeCardSummary): string {
  const parts: string[] = [];
  // 0 means unknown upstream (TheMealDB carries no timings), not "instant".
  if (recipe.totalTime && recipe.totalTime > 0) parts.push(`${recipe.totalTime} min`);
  if (recipe.servings) parts.push(`Serves ${recipe.servings}`);
  if (recipe.nutrition?.calories) parts.push(`${Math.round(recipe.nutrition.calories)} kcal`);
  if (recipe.nutrition?.protein) parts.push(`${Math.round(recipe.nutrition.protein)} g protein`);
  return parts.join(' · ');
}

export function RecipeCard({
  recipe,
  onPress,
  badge,
  variant = 'hero',
  showOpenAffordance = false,
  loading = false,
  style,
}: RecipeCardProps) {
  const compact = variant === 'compact';
  const meta = metaLine(recipe);

  return (
    <Card
      padded={false}
      // Card renders a plain View when there is no handler, so this makes the
      // press genuinely dead rather than merely looking disabled.
      onPress={loading ? undefined : onPress}
      style={{ ...styles.card, ...(style ?? {}) }}
    >
      <View style={compact ? styles.mediaCompact : styles.media}>
        {recipe.imageUrl ? (
          <Image source={{ uri: recipe.imageUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.placeholder}>
            <UtensilsCrossed size={compact ? 20 : 28} color={color.muted} strokeWidth={1.5} />
          </View>
        )}
        {badge ? (
          <View style={styles.badge}>
            <Text preset="caption" color={color.white} style={styles.badgeLabel}>
              {badge.toUpperCase()}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text preset={compact ? 'titleSm' : 'titleMd'} numberOfLines={2}>
          {recipe.title}
        </Text>

        {meta ? <Text preset="bodyMd">{meta}</Text> : null}

        {(recipe.pantryMatch || (recipe.dietaryTags?.length ?? 0) > 0) && (
          <View style={styles.chips}>
            {recipe.pantryMatch ? <Chip label={recipe.pantryMatch} /> : null}
            {(recipe.dietaryTags ?? []).slice(0, 2).map(tag => (
              <Chip key={tag} label={tag} />
            ))}
          </View>
        )}

        {showOpenAffordance && (
          <View style={styles.open}>
            <Text preset="caption" color={loading ? color.muted : color.ink}>
              {loading ? 'Saving to your recipes' : 'Open recipe'}
            </Text>
            {loading ? (
              <ActivityIndicator size="small" color={color.muted} />
            ) : (
              <ChevronRight size={14} color={color.ink} strokeWidth={1.85} />
            )}
          </View>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  media: { height: 172, position: 'relative' },
  mediaCompact: { height: 108, position: 'relative' },
  image: { width: '100%', height: '100%' },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: color.surfaceSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    left: space.sm,
    top: space.sm,
    backgroundColor: color.ink,
    borderRadius: radius.sm,
    paddingHorizontal: space.xs,
    paddingVertical: space.xxs,
  },
  badgeLabel: { letterSpacing: 1 },
  body: { padding: space.md, gap: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xxs },
  open: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, marginTop: space.xxs },
});
