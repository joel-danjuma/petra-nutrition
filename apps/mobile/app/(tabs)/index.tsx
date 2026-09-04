import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, ScrollView, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight } from 'lucide-react-native';
import { router } from 'expo-router';
import { useAuth, useAuthStore, usePantry } from '@petra/shared';

import { color, radius, space } from '../../src/theme';
import { Button } from '../../src/components/ui/Button';
import { Card, onSurface } from '../../src/components/ui/Card';
import { Chip } from '../../src/components/ui/Chip';
import { ProgressRow } from '../../src/components/ui/ProgressRow';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { Text } from '../../src/components/ui/Text';
import { RecipeCard } from '../../src/components/RecipeCard';
import { API_URL } from '../../src/config/api';

interface PlannedRecipe {
  id: string;
  title: string;
  imageUrl?: string | null;
  totalTime?: number;
  servings?: number;
  dietaryTags?: string[];
  nutrition?: { calories?: number; protein?: number } | null;
}

interface PlannedMeal {
  recipe: PlannedRecipe;
  /** Planner's reason chip — "Leftovers", "Uses 3 expiring", "Zero waste". */
  tag?: string | null;
}

interface WasteSummary {
  thisMonthKgSaved: number;
}

interface TodayNutrition {
  caloriesConsumed: number;
  proteinG: number;
  fiberG: number;
  vegServings: number;
  targets: { calories: number; proteinG: number; fiberG: number; vegServings: number };
}

/**
 * The one-line read on the day, computed from real numbers rather than
 * templated optimism — if tonight's dinner won't close the protein gap, it says
 * so. Returns the plainest true statement available for the data we have.
 */
function nutritionSummary(n: TodayNutrition, tonight?: PlannedRecipe): string {
  const proteinLeft = Math.max(0, n.targets.proteinG - n.proteinG);
  const caloriesLeft = Math.max(0, n.targets.calories - n.caloriesConsumed);
  const dinnerProtein = tonight?.nutrition?.protein ?? 0;

  if (proteinLeft === 0) {
    return `You're at your protein target with ${Math.round(caloriesLeft)} kcal still to play with.`;
  }
  if (dinnerProtein > 0) {
    const after = Math.max(0, proteinLeft - dinnerProtein);
    return after === 0
      ? `Tonight's plate closes the protein gap and leaves about ${Math.round(caloriesLeft - (tonight?.nutrition?.calories ?? 0))} kcal spare.`
      : `Tonight's plate gets you within ${Math.round(after)} g of your protein target.`;
  }
  return `${Math.round(proteinLeft)} g of protein and ${Math.round(caloriesLeft)} kcal left today.`;
}

export default function TodayScreen() {
  const { user } = useAuth();
  const token = useAuthStore(state => state.token);
  const { items: pantryItems, fetchItems } = usePantry();

  const [tonight, setTonight] = useState<PlannedMeal | null>(null);
  const [remix, setRemix] = useState<PlannedMeal | null>(null);
  const [waste, setWaste] = useState<WasteSummary | null>(null);
  const [nutrition, setNutrition] = useState<TodayNutrition | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    fetchItems().catch(() => {});

    try {
      const res = await fetch(`${API_URL}/meal-plans?limit=1`, { headers });
      const data = await res.json();
      if (data.success) {
        const plan = data.data?.mealPlans?.[0];
        const meals: any[] = plan?.meals ?? [];
        const todayStr = new Date().toISOString().split('T')[0];

        const dinner = meals.find(
          m => m.mealType === 'DINNER' && String(m.date).split('T')[0] === todayStr
        );
        setTonight(dinner?.recipe ? { recipe: dinner.recipe, tag: dinner.tag } : null);

        // The Remix tile: the next meal the planner has marked as living off
        // something already cooked. Falls back to nothing rather than inventing
        // a leftovers idea the plan doesn't actually contain.
        const leftovers = meals
          .filter(m => m.recipe && /leftover/i.test(m.tag ?? ''))
          .sort((a, b) => String(a.date).localeCompare(String(b.date)))
          .find(m => String(m.date).split('T')[0] >= todayStr);
        setRemix(leftovers ? { recipe: leftovers.recipe, tag: leftovers.tag } : null);
      }
    } catch {
      setTonight(null);
      setRemix(null);
    }

    try {
      const res = await fetch(`${API_URL}/analytics/waste-summary`, { headers });
      const data = await res.json();
      if (data.success) setWaste(data.data);
    } catch {
      // non-fatal
    }

    try {
      const res = await fetch(`${API_URL}/analytics/today-nutrition`, { headers });
      const data = await res.json();
      if (data.success) setNutrition(data.data);
    } catch {
      // non-fatal
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const needsUsing = useMemo(() => {
    const now = Date.now();
    return pantryItems
      .filter(p => p.expirationDate)
      .map(p => ({
        ...p,
        days: Math.ceil((new Date(p.expirationDate!).getTime() - now) / 86400000),
      }))
      .filter(p => p.days <= 4)
      .sort((a, b) => a.days - b.days)
      .slice(0, 3);
  }, [pantryItems]);

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.ink} />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text preset="caption" style={styles.eyebrow}>
              {todayLabel.toUpperCase()}
            </Text>
            <Text preset="displayMd">Tonight</Text>
          </View>
          <Pressable
            style={styles.avatar}
            onPress={() => router.push('/(tabs)/profile')}
            accessibilityRole="button"
            accessibilityLabel="Your profile"
          >
            <Text preset="labelMd" color={color.ink}>
              {(user?.firstName?.[0] || '?').toUpperCase()}
            </Text>
          </Pressable>
        </View>

        <View style={styles.body}>
          {/* Cream is the system's callout surface — a full surface, not a tint. */}
          {needsUsing.length > 0 && (
            <Card surface="cream" onPress={() => router.push('/(tabs)/pantry')}>
              <View style={styles.calloutHeader}>
                <Text preset="titleSm" color={onSurface.cream} style={styles.flex}>
                  {needsUsing.length} thing{needsUsing.length > 1 ? 's' : ''} need using
                </Text>
                <ChevronRight size={18} color={onSurface.cream} strokeWidth={1.85} />
              </View>
              <View style={styles.chipRow}>
                {needsUsing.map(item => (
                  <Chip
                    key={item.id}
                    label={`${item.name} · ${item.days <= 0 ? 'today' : `${item.days}d`}`}
                  />
                ))}
              </View>
            </Card>
          )}

          {tonight ? (
            <View style={styles.stack}>
              <RecipeCard
                recipe={tonight.recipe}
                badge={tonight.tag ?? undefined}
                onPress={() => router.push(`/recipes/${tonight.recipe.id}`)}
              />
              <View style={styles.heroActions}>
                <Button
                  onPress={() => router.push(`/recipes/${tonight.recipe.id}`)}
                  style={styles.flex}
                >
                  See the recipe
                </Button>
                <Button
                  variant="secondary"
                  onPress={() => router.push(`/recipes/${tonight.recipe.id}/cook`)}
                >
                  Cook now
                </Button>
              </View>
            </View>
          ) : (
            <Card>
              <View style={styles.stack}>
                <Text preset="titleMd">Nothing planned yet</Text>
                <Text preset="bodyMd">
                  Ask Petra to invent something for tonight, built around what&apos;s already in
                  your kitchen.
                </Text>
                <Button onPress={() => router.push('/(tabs)/petra')} fullWidth>
                  Ask Petra
                </Button>
              </View>
            </Card>
          )}

          <View style={styles.tileRow}>
            {/* Remix: tomorrow's meal built from tonight's cooking. Falls back
                to discovery when the plan has no leftovers meal. */}
            {remix ? (
              <RecipeCard
                variant="compact"
                recipe={remix.recipe}
                badge="Remix"
                onPress={() => router.push(`/recipes/${remix.recipe.id}`)}
                style={styles.tile}
              />
            ) : (
              <Card onPress={() => router.push('/recipes')} style={styles.tile}>
                <Text preset="caption" style={styles.eyebrow}>
                  DISCOVER
                </Text>
                <Text preset="titleSm">Find something new to cook</Text>
              </Card>
            )}

            {/* Zero waste earns the forest signature surface, full-bleed. */}
            <Card surface="forest" onPress={() => router.push('/(tabs)/pantry')} style={styles.tile}>
              <Text preset="caption" color={onSurface.forest} style={styles.eyebrow}>
                ZERO WASTE
              </Text>
              <Text preset="titleSm" color={onSurface.forest}>
                {waste ? `${waste.thisMonthKgSaved} kg saved this month` : 'Track what you use'}
              </Text>
            </Card>
          </View>

          <Card surface="soft" onPress={() => router.push('/(tabs)/petra')}>
            <View style={styles.askRow}>
              <View style={styles.askAvatar}>
                <Text preset="caption" color={color.white}>
                  P
                </Text>
              </View>
              <Text preset="bodyMd">Ask Petra to invent something…</Text>
            </View>
          </Card>

          {nutrition && (
            <Card>
              <SectionHeader title="Today so far" />
              <Text preset="caption" style={styles.calorieReadout}>
                {Math.round(nutrition.caloriesConsumed)} / {Math.round(nutrition.targets.calories)}{' '}
                kcal
              </Text>
              <View style={styles.stack}>
                {[
                  {
                    label: 'Protein',
                    value: nutrition.proteinG,
                    target: nutrition.targets.proteinG,
                    unit: 'g',
                  },
                  {
                    label: 'Fibre',
                    value: nutrition.fiberG,
                    target: nutrition.targets.fiberG,
                    unit: 'g',
                  },
                  {
                    label: 'Veg',
                    value: nutrition.vegServings,
                    target: nutrition.targets.vegServings,
                    unit: '',
                  },
                ].map(row => (
                  <ProgressRow
                    key={row.label}
                    label={row.label}
                    value={row.value / (row.target || 1)}
                    readout={`${Math.round(row.value)} / ${Math.round(row.target)}${row.unit}`}
                  />
                ))}
              </View>

              {/* The closing line the mockup ends this card on: what tonight's
                  plate does to the day, stated plainly. */}
              <View style={styles.summary}>
                <Text preset="bodyMd">{nutritionSummary(nutrition, tonight?.recipe)}</Text>
              </View>
            </Card>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.canvas },
  flex: { flex: 1 },
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
  eyebrow: { letterSpacing: 1.2 },
  avatar: {
    width: space.xl + space.xxs,
    height: space.xl + space.xxs,
    borderRadius: radius.full,
    backgroundColor: color.surfaceStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: { padding: space.lg, gap: space.md },
  stack: { gap: space.sm },
  calloutHeader: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm },
  heroActions: { flexDirection: 'row', gap: space.xs, marginTop: space.xxs },
  tileRow: { flexDirection: 'row', gap: space.sm },
  tile: { flex: 1, minHeight: 96, justifyContent: 'space-between', gap: space.xs },
  askRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  askAvatar: {
    width: space.lg,
    height: space.lg,
    borderRadius: radius.full,
    backgroundColor: color.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calorieReadout: { marginTop: -space.xs, marginBottom: space.sm },
  summary: {
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
  },
});
