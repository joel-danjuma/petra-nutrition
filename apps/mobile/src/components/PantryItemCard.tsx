import React from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import {
  Apple,
  Beef,
  Boxes,
  CircleDashed,
  Coffee,
  Croissant,
  Fish,
  Flower2,
  type LucideIcon,
  Milk,
  Package,
  Snowflake,
  Soup,
  TriangleAlert,
} from 'lucide-react-native';

import { color, semantic, space } from '../theme';
import { Card } from './ui/Card';
import { Text } from './ui/Text';

interface PantryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  location: string;
  expirationDate?: string;
  isLowStock: boolean;
  brand?: string;
}

interface PantryItemCardProps {
  item: PantryItem;
  onPress: () => void;
  onDelete: () => void;
  onEdit: () => void;
}

const CATEGORY_ICON: Record<string, LucideIcon> = {
  produce: Apple,
  dairy: Milk,
  meat: Beef,
  seafood: Fish,
  grains: Croissant,
  pantry_staples: Package,
  spices: Flower2,
  condiments: Soup,
  beverages: Coffee,
  frozen: Snowflake,
  canned: Boxes,
  snacks: Croissant,
  other: CircleDashed,
};

/**
 * Expiry urgency is carried by type colour, not by a tinted status chip.
 *
 * The design system reserves its signature hues for full-bleed surfaces and
 * gets emphasis from size and colour contrast, so a scale of pastel badge
 * backgrounds would be off-system — and the old `colour + '20'` alpha tints
 * had no token behind them at all. Coral marks the genuinely urgent case;
 * everything else steps down through ink to muted.
 */
function expiryStatus(expirationDate?: string): { text: string; color: string } | null {
  if (!expirationDate) return null;

  const days = Math.ceil(
    (new Date(expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  if (days < 0) return { text: 'Expired', color: semantic.danger };
  if (days === 0) return { text: 'Use today', color: semantic.danger };
  if (days <= 3) return { text: `${days} day${days > 1 ? 's' : ''} left`, color: color.ink };
  if (days <= 7) return { text: `${days} days left`, color: color.body };
  return null;
}

export function PantryItemCard({ item, onPress, onDelete, onEdit }: PantryItemCardProps) {
  const Icon = CATEGORY_ICON[item.category] ?? CircleDashed;
  const expiry = expiryStatus(item.expirationDate);

  const handleLongPress = () => {
    Alert.alert(item.name, 'What would you like to do?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Edit', onPress: onEdit },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <Card style={styles.card} onPress={onPress} onLongPress={handleLongPress}>
      <View>
        <View style={styles.header}>
          <Icon size={20} color={color.ink} strokeWidth={1.85} />
          <View style={styles.title}>
            <Text preset="labelMd" color={color.ink} numberOfLines={1}>
              {item.name}
            </Text>
            {item.brand ? (
              <Text preset="caption" numberOfLines={1}>
                {item.brand}
              </Text>
            ) : null}
          </View>
          <Text preset="labelMd" color={color.ink}>
            {item.quantity} {item.unit}
          </Text>
        </View>

        <View style={styles.footer}>
          <Text preset="caption" style={styles.location}>
            {item.location}
          </Text>

          <View style={styles.status}>
            {item.isLowStock ? (
              <View style={styles.statusItem}>
                <TriangleAlert size={13} color={semantic.danger} strokeWidth={1.85} />
                <Text preset="caption" color={semantic.danger}>
                  Running low
                </Text>
              </View>
            ) : null}
            {expiry ? (
              <Text preset="caption" color={expiry.color}>
                {expiry.text}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: space.sm, gap: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { flex: 1, gap: space.xxs },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.sm,
  },
  location: { textTransform: 'capitalize' },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  statusItem: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
});
