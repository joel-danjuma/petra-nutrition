import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronLeft, ShoppingCart } from 'lucide-react-native';
import { router } from 'expo-router';
import { useAuthStore, usePantry } from '@petra/shared';

import { color, radius, space } from '../../src/theme';
import { Card, onSurface } from '../../src/components/ui/Card';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { Text } from '../../src/components/ui/Text';
import { API_URL } from '../../src/config/api';

const CATEGORY_LABELS: Record<string, string> = {
  PRODUCE: 'Produce',
  DAIRY: 'Dairy',
  MEAT: 'Meat',
  SEAFOOD: 'Seafood',
  GRAINS: 'Grains',
  PANTRY_STAPLES: 'Dry goods',
  SPICES: 'Spices',
  CONDIMENTS: 'Condiments',
  BEVERAGES: 'Beverages',
  FROZEN: 'Frozen',
  CANNED: 'Canned',
  SNACKS: 'Snacks',
  OTHER: 'Other',
};

interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  isCompleted: boolean;
}

interface ShoppingListData {
  id: string;
  items: ShoppingItem[];
}

export default function ShoppingListScreen() {
  const token = useAuthStore(state => state.token);
  const { items: pantryItems } = usePantry();
  const [list, setList] = useState<ShoppingListData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/shopping-lists?limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setList(data.data?.shoppingLists?.[0] ?? null);
    } catch {
      Alert.alert('Error', 'Failed to load your shopping list.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleItem = async (item: ShoppingItem) => {
    if (!list) return;
    const nextCompleted = !item.isCompleted;
    setList(prev =>
      prev
        ? {
            ...prev,
            items: prev.items.map(i =>
              i.id === item.id ? { ...i, isCompleted: nextCompleted } : i
            ),
          }
        : prev
    );
    try {
      await fetch(`${API_URL}/shopping-lists/${list.id}/items`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [{ itemId: item.id, updates: { isCompleted: nextCompleted } }],
        }),
      });
    } catch {
      setList(prev =>
        prev
          ? {
              ...prev,
              items: prev.items.map(i =>
                i.id === item.id ? { ...i, isCompleted: item.isCompleted } : i
              ),
            }
          : prev
      );
    }
  };

  const pantryNames = useMemo(
    () => pantryItems.map(p => p.name.toLowerCase().trim()),
    [pantryItems]
  );

  const alreadyHaveCount = useMemo(() => {
    if (!list) return 0;
    return list.items.filter(item =>
      pantryNames.some(
        n => n.includes(item.name.toLowerCase()) || item.name.toLowerCase().includes(n)
      )
    ).length;
  }, [list, pantryNames]);

  const sections = useMemo(() => {
    if (!list) return [];
    const byCategory = new Map<string, ShoppingItem[]>();
    for (const item of list.items) {
      const arr = byCategory.get(item.category) ?? [];
      arr.push(item);
      byCategory.set(item.category, arr);
    }
    return Array.from(byCategory.entries()).map(([category, items]) => ({
      aisle: CATEGORY_LABELS[category] ?? category,
      items,
    }));
  }, [list]);

  const doneCount = list?.items.filter(i => i.isCompleted).length ?? 0;
  const totalCount = list?.items.length ?? 0;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={24} color={color.ink} strokeWidth={1.85} />
        </Pressable>
        <View style={styles.flex}>
          <Text preset="titleLg">Shopping</Text>
          <Text preset="caption">
            {doneCount} of {totalCount} picked up · built from this week&apos;s plan
          </Text>
        </View>
        <Pressable
          style={styles.planBtn}
          onPress={() => router.push('/(tabs)/meal-plans')}
          accessibilityRole="button"
        >
          <Text preset="caption" color={color.ink}>
            Plan
          </Text>
        </Pressable>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <LoadingSpinner size="large" />
        </View>
      ) : !list || list.items.length === 0 ? (
        <View style={styles.centered}>
          <ShoppingCart size={40} color={color.muted} strokeWidth={1.5} />
          <Text preset="titleMd" align="center">
            No shopping list yet
          </Text>
          <Text preset="bodyMd" align="center">
            Build one from this week&apos;s meal plan.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {sections.map(sec => (
            <View key={sec.aisle}>
              <SectionHeader title={sec.aisle} />
              <Card padded={false}>
                {sec.items.map((item, i) => (
                  <Pressable
                    key={item.id}
                    style={[styles.row, i < sec.items.length - 1 && styles.rowDivider]}
                    onPress={() => toggleItem(item)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: item.isCompleted }}
                  >
                    <View style={[styles.checkbox, item.isCompleted && styles.checkboxOn]}>
                      {item.isCompleted && (
                        <Check size={13} color={color.white} strokeWidth={2.4} />
                      )}
                    </View>
                    <Text
                      preset="labelMd"
                      color={item.isCompleted ? color.muted : color.ink}
                      style={[styles.flex, item.isCompleted && styles.completed]}
                    >
                      {item.name}
                    </Text>
                    <Text preset="caption">
                      {item.quantity} {item.unit}
                    </Text>
                  </Pressable>
                ))}
              </Card>
            </View>
          ))}

          {/* Skipping a repeat purchase is a zero-waste win, so it takes the
              forest signature surface rather than a green tint. */}
          {alreadyHaveCount > 0 && (
            <Card surface="forest">
              <Text preset="titleSm" color={onSurface.forest}>
                {alreadyHaveCount} items already in your pantry
              </Text>
              <Text preset="bodyMd" color={onSurface.forest} style={styles.savedDesc}>
                You already have usable quantities of these — no need to buy them again.
              </Text>
            </Card>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.canvas },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
    paddingHorizontal: space.md,
    paddingTop: space.xs,
    paddingBottom: space.sm,
  },
  planBtn: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  progressTrack: {
    height: 4,
    marginHorizontal: space.md,
    marginTop: space.sm,
    borderRadius: radius.xs,
    backgroundColor: color.surfaceStrong,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: color.ink },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.xl,
    gap: space.sm,
  },
  body: { padding: space.lg, gap: space.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: color.hairline },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.hairline,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxOn: { backgroundColor: color.ink, borderColor: color.ink },
  completed: { textDecorationLine: 'line-through' },
  savedDesc: { marginTop: space.xs },
});
