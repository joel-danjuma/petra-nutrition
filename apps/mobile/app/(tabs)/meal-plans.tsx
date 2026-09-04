import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarDays, Lock } from 'lucide-react-native';
import { router } from 'expo-router';
import { isPremium, useAuth, useAuthStore } from '@petra/shared';

import { color, fontSize, radius, space, type } from '../../src/theme';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { Chip } from '../../src/components/ui/Chip';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';
import { Text } from '../../src/components/ui/Text';
import { API_URL } from '../../src/config/api';

interface PlanMeal {
  id: string;
  date: string;
  mealType: string;
  recipe?: {
    id: string;
    title: string;
    prepTime: number;
    cookTime: number;
    totalTime?: number;
    imageUrl?: string | null;
  };
  customName?: string;
  /** Planner's reason chip — "Leftovers", "Batch", "Uses 3 expiring". */
  tag?: string | null;
}

interface PlanDay {
  dateStr: string;
  label: string;
  dayNum: string;
  meals: PlanMeal[];
}

export default function PlanScreen() {
  const { user } = useAuth();
  const token = useAuthStore(state => state.token);
  // Via the shared helper: the API returns 'PREMIUM' and this compared
  // against 'premium', so it was always false and locked every premium user out.
  const premium = isPremium(user);

  const [meals, setMeals] = useState<PlanMeal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(0);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [days, setDays] = useState('3');
  const [preferences, setPreferences] = useState('');

  const fetchPlan = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/meal-plans?limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setMeals(data.data?.mealPlans?.[0]?.meals ?? []);
    } catch {
      Alert.alert('Error', 'Failed to load your meal plan.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlan();
  }, []);

  const dayGrid: PlanDay[] = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - start.getDay() + 1); // Monday of this week
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      return {
        dateStr,
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        dayNum: String(d.getDate()),
        meals: meals.filter(m => String(m.date).split('T')[0] === dateStr),
      };
    });
  }, [meals]);

  const generatePlan = async () => {
    const numDays = parseInt(days, 10);
    if (isNaN(numDays) || numDays < 1 || numDays > 14) {
      Alert.alert('Invalid input', 'Please enter between 1 and 14 days.');
      return;
    }
    setIsGenerating(true);
    try {
      const res = await fetch(`${API_URL}/meal-plans/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: numDays, preferences }),
      });
      const data = await res.json();
      if (data.success) {
        setShowGenerateModal(false);
        setDays('3');
        setPreferences('');
        fetchPlan();
      } else {
        throw new Error(data.error?.message || 'Generation failed');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to generate meal plan.');
    } finally {
      setIsGenerating(false);
    }
  };

  const isLocked = (i: number) => !premium && i > 0;
  const selected = dayGrid[selectedDay];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text preset="displayMd">This week</Text>
          <Text preset="caption">
            {premium ? '7 days planned' : 'Free plan · one day at a time'}
          </Text>
        </View>
        <Button size="sm" onPress={() => router.push('/(tabs)/petra')}>
          Rebuild
        </Button>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dayRow}
        style={styles.dayRowOuter}
      >
        {dayGrid.map((d, i) => {
          const on = selectedDay === i;
          const locked = isLocked(i);
          return (
            <Pressable
              key={d.dateStr}
              style={[styles.dayCell, on ? styles.dayCellOn : styles.dayCellOff]}
              onPress={() => setSelectedDay(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text preset="caption" color={on ? color.white : color.muted}>
                {d.label}
              </Text>
              <Text preset="titleSm" color={on ? color.white : color.ink}>
                {d.dayNum}
              </Text>
              {!locked && d.meals.length > 0 && (
                <View
                  style={[styles.dayDot, { backgroundColor: on ? color.white : color.ink }]}
                />
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <View style={styles.centered}>
          <LoadingSpinner size="large" />
        </View>
      ) : isLocked(selectedDay) ? (
        <View style={styles.lockedBody}>
          <Card surface="soft">
            <View style={styles.lockedIcon}>
              <Lock size={18} color={color.ink} strokeWidth={1.85} />
            </View>
            <Text preset="titleMd" style={styles.lockedTitle}>
              Free plans cover one day at a time
            </Text>
            <Text preset="bodyMd" style={styles.lockedDesc}>
              Premium plans the whole week around what&apos;s already in your kitchen, then
              writes the shopping list around the gaps.
            </Text>
            <Button onPress={() => router.push('/(tabs)/profile')} fullWidth>
              See Premium
            </Button>
          </Card>
        </View>
      ) : selected.meals.length === 0 ? (
        <View style={styles.centered}>
          <CalendarDays size={40} color={color.muted} strokeWidth={1.5} />
          <Text preset="titleMd" align="center">
            Nothing planned
          </Text>
          <Text preset="bodyMd" align="center">
            Generate a plan to fill this day.
          </Text>
          <Button onPress={() => setShowGenerateModal(true)} style={styles.emptyCta}>
            Generate plan
          </Button>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.mealsBody} showsVerticalScrollIndicator={false}>
          {selected.meals.map(m => (
            <Card
              key={m.id}
              onPress={m.recipe ? () => router.push(`/recipes/${m.recipe!.id}`) : undefined}
            >
              <View style={styles.mealHeader}>
                <Text preset="caption" style={styles.mealSlot}>
                  {m.mealType.toUpperCase()}
                </Text>
                {m.tag ? <Chip label={m.tag} /> : null}
              </View>
              <Text preset="titleSm" style={styles.mealName}>
                {m.recipe?.title ?? m.customName ?? 'Meal'}
              </Text>
              {m.recipe && (
                <Text preset="bodyMd">{m.recipe.prepTime + m.recipe.cookTime} min</Text>
              )}
            </Card>
          ))}
          <Button variant="secondary" onPress={() => router.push('/shopping')} fullWidth>
            Build the shopping list
          </Button>
        </ScrollView>
      )}

      <Modal visible={showGenerateModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.container}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowGenerateModal(false)} accessibilityRole="button">
              <Text preset="labelMd" color={color.muted}>
                Cancel
              </Text>
            </Pressable>
            <Text preset="titleSm">Generate meal plan</Text>
            <Pressable onPress={generatePlan} disabled={isGenerating} accessibilityRole="button">
              {isGenerating ? (
                <LoadingSpinner />
              ) : (
                <Text preset="labelMd" color={color.ink}>
                  Generate
                </Text>
              )}
            </Pressable>
          </View>

          <ScrollView style={styles.flex} contentContainerStyle={styles.modalBodyContent}>
            <Text preset="labelMd" style={styles.fieldLabel}>
              Number of days
            </Text>
            <TextInput
              style={styles.fieldInput}
              value={days}
              onChangeText={setDays}
              keyboardType="number-pad"
              placeholder="1-14"
              placeholderTextColor={color.muted}
              maxLength={2}
            />
            <Text preset="caption" style={styles.fieldHint}>
              Free plan: 1 day. Premium: up to 14 days.
            </Text>

            <Text preset="labelMd" style={styles.fieldLabel}>
              Dietary preferences
            </Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputMulti]}
              value={preferences}
              onChangeText={setPreferences}
              placeholder="Vegetarian, low-carb, no shellfish"
              placeholderTextColor={color.muted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
  dayRowOuter: { flexGrow: 0 },
  dayRow: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.xxs },
  dayCell: {
    width: 48,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    alignItems: 'center',
    gap: space.xxs,
    marginRight: space.xxs,
  },
  dayCellOn: { backgroundColor: color.ink },
  dayCellOff: { backgroundColor: color.surfaceSoft },
  dayDot: { width: 4, height: 4, borderRadius: radius.xs },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.xl,
    gap: space.sm,
  },
  emptyCta: { marginTop: space.xs },
  lockedBody: { padding: space.lg },
  lockedIcon: {
    width: space.xl + space.xxs,
    height: space.xl + space.xxs,
    borderRadius: radius.full,
    backgroundColor: color.canvas,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockedTitle: { marginTop: space.sm },
  lockedDesc: { marginTop: space.xs, marginBottom: space.sm },
  mealsBody: { padding: space.lg, gap: space.sm },
  mealHeader: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  mealSlot: { letterSpacing: 1.2 },
  mealName: { marginTop: space.xxs, marginBottom: space.xxs },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  modalBodyContent: { padding: space.lg },
  fieldLabel: { marginBottom: space.xs, marginTop: space.md },
  fieldInput: {
    ...type.bodyMd,
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    fontSize: fontSize.labelMd,
    color: color.ink,
    backgroundColor: color.canvas,
  },
  fieldInputMulti: { height: 100, paddingTop: space.sm },
  fieldHint: { marginTop: space.xs },
});
