import { useState, useEffect, useMemo } from 'react';
import { View, FlatList, Pressable, StyleSheet, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Package, ScanLine } from 'lucide-react-native';
import { router } from 'expo-router';
import { enumEquals, usePantry } from '@petra/shared';

import { color, radius, semantic, shadow, space, type } from '../../src/theme';
import { Text } from '../../src/components/ui/Text';
import { Chip } from '../../src/components/ui/Chip';
import { Card } from '../../src/components/ui/Card';
import { SearchBar } from '../../src/components/SearchBar';

// Ids are the canonical enum values so they compare directly against what the
// API returns; the labels stay human. Previously these were lowercase, so
// selecting any category filtered the list down to nothing.
const CATEGORIES = [
  { id: 'all', label: 'Everything' },
  { id: 'PRODUCE', label: 'Produce' },
  { id: 'DAIRY', label: 'Dairy' },
  { id: 'MEAT', label: 'Meat' },
  { id: 'PANTRY_STAPLES', label: 'Staples' },
  { id: 'FROZEN', label: 'Frozen' },
];

/**
 * Shelf-life state.
 *
 * The old version ran a six-colour rainbow of ad-hoc hexes. Urgency is now
 * carried by type colour against a neutral track: coral for the genuinely
 * urgent, ink for the imminent, muted for everything comfortable. Signature
 * colours stay reserved for full surfaces, so nothing here is tinted.
 */
function shelfLife(item: { isLowStock?: boolean; expirationDate?: string | Date }): {
  badge: string;
  tone: string;
  pct: number;
} {
  if (item.isLowStock) return { badge: 'Running low', tone: semantic.danger, pct: 14 };
  if (!item.expirationDate) return { badge: 'Stocked', tone: color.muted, pct: 100 };

  const days = Math.ceil((new Date(item.expirationDate).getTime() - Date.now()) / 86400000);
  if (days <= 0) return { badge: 'Use today', tone: semantic.danger, pct: 6 };
  if (days <= 3) {
    return { badge: `${days} day${days > 1 ? 's' : ''} left`, tone: color.ink, pct: Math.round((days / 14) * 100) };
  }
  if (days <= 10) {
    return { badge: `${days} days left`, tone: color.body, pct: Math.round((days / 14) * 100) };
  }
  return { badge: 'Weeks left', tone: color.muted, pct: 100 };
}

export default function PantryScreen() {
  const { items, isLoading, fetchItems, deleteItem } = usePantry();
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState('all');

  useEffect(() => {
    fetchItems();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchItems();
    setRefreshing(false);
  };

  const handleDeleteItem = (itemId: string, name: string) => {
    Alert.alert(name, 'How would you like to log this item?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Used it up', onPress: () => deleteItem(itemId, 'used') },
      { text: 'Threw it out', style: 'destructive', onPress: () => deleteItem(itemId, 'wasted') },
    ]);
  };

  const filteredItems = useMemo(
    () =>
      items.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = category === 'all' || enumEquals(item.category, category);
        return matchesSearch && matchesCategory;
      }),
    [items, searchQuery, category]
  );

  const expiringSoon = items.filter(i => {
    if (!i.expirationDate) return false;
    const days = Math.ceil((new Date(i.expirationDate).getTime() - Date.now()) / 86400000);
    return days <= 3 && days >= 0;
  }).length;
  const lowStock = items.filter(i => i.isLowStock).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text preset="displayMd">Pantry</Text>
          <Text preset="caption">
            {items.length} items · {expiringSoon} need using · {lowStock} running low
          </Text>
        </View>
        <Pressable
          style={styles.listBtn}
          onPress={() => router.push('/shopping')}
          accessibilityRole="button"
        >
          <Text preset="caption" color={color.ink}>
            List
          </Text>
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search the pantry"
        />
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={CATEGORIES}
        keyExtractor={c => c.id}
        style={styles.catRow}
        contentContainerStyle={styles.catRowContent}
        renderItem={({ item: c }) => (
          <Chip
            label={c.label}
            selected={category === c.id}
            onPress={() => setCategory(c.id)}
            style={styles.catChip}
          />
        )}
      />

      <FlatList
        data={filteredItems}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const { badge, tone, pct } = shelfLife(item);
          return (
            <Card
              style={styles.card}
              onLongPress={() => handleDeleteItem(item.id, item.name)}
            >
              <View style={styles.cardTop}>
                <Text preset="labelMd" color={color.ink} style={styles.itemName}>
                  {item.name}
                </Text>
                <Text preset="caption">
                  {item.quantity} {item.unit}
                </Text>
              </View>
              <View style={styles.cardBottom}>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${pct}%`, backgroundColor: tone }]} />
                </View>
                <Text preset="caption" color={tone}>
                  {badge}
                </Text>
              </View>
            </Card>
          );
        }}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.ink} />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyContainer}>
              <Package size={40} color={color.muted} strokeWidth={1.5} />
              <Text preset="titleMd" align="center">
                Your pantry is empty
              </Text>
              <Text preset="bodyMd" align="center">
                Scan a barcode or a shelf of fresh food to get started.
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          filteredItems.length > 0 ? (
            <View style={styles.hintCard}>
              <Text preset="caption" align="center">
                Petra logs expiry dates from receipts and labels automatically.
              </Text>
            </View>
          ) : null
        }
      />

      <Pressable
        style={({ pressed }) => [
          styles.scanFab,
          { backgroundColor: pressed ? color.primaryActive : color.ink },
          shadow.buttonRest,
        ]}
        onPress={() => router.push('/pantry/scan/camera')}
        accessibilityRole="button"
      >
        <ScanLine size={18} color={color.white} strokeWidth={1.85} />
        <Text preset="labelMd" color={color.white}>
          Scan
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
    paddingBottom: space.sm,
  },
  headerText: { gap: space.xxs },
  listBtn: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  searchWrap: { paddingHorizontal: space.lg, paddingTop: space.sm },
  catRow: { marginTop: space.sm, flexGrow: 0 },
  catRowContent: { paddingHorizontal: space.lg },
  catChip: { marginRight: space.xs },
  listContainer: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: 110,
  },
  card: { marginBottom: space.xs, gap: space.xs },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  itemName: { flex: 1 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  track: {
    flex: 1,
    height: 5,
    borderRadius: radius.xs,
    backgroundColor: color.surfaceStrong,
    overflow: 'hidden',
  },
  fill: { height: '100%' },
  hintCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.hairline,
    borderRadius: radius.md,
    padding: space.md,
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: space.section / 2,
    paddingHorizontal: space.xxl,
    gap: space.sm,
  },
  scanFab: {
    position: 'absolute',
    right: space.lg,
    bottom: space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
});
