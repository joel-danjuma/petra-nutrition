import { useState, useEffect, useRef } from 'react';
import { View, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@petra/shared';

import { API_URL } from '../../../src/config/api';
import { color, onDark, radius, space, type } from '../../../src/theme';
import { Text } from '../../../src/components/ui/Text';
import { LoadingSpinner } from '../../../src/components/ui/LoadingSpinner';

interface RecipeIngredient {
  id: string;
  name: string;
  amount: number;
  unit: string;
}

interface RecipeInstruction {
  id: string;
  step: number;
  instruction: string;
  duration?: number;
  tip?: string | null;
}

interface RecipeDetail {
  id: string;
  title: string;
  servings: number;
  ingredients: RecipeIngredient[];
  instructions: RecipeInstruction[];
  nutrition?: { calories: number; protein: number; fiber?: number };
}

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Cook Mode runs on the design system's dark surface.
 *
 * This is a documented full-bleed dark *surface*, not a dark theme — so the
 * on-dark rules apply: type stays white, and the emphasised control is a solid
 * white button (the system never inverts a button or tints it on dark).
 */
export default function CookModeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useAuthStore(state => state.token);
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [sec, setSec] = useState(0);
  const [running, setRunning] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/recipes/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!cancelled && data.success) {
          setRecipe(data.data);
          setSec(
            data.data.instructions?.[0]?.duration
              ? data.data.instructions[0].duration * 60
              : 0
          );
        }
      } catch {
        if (!cancelled) Alert.alert('Error', 'Failed to load recipe.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSec(s => {
        if (running && s > 0) return s - 1;
        if (running && s === 0) setRunning(false);
        return s;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [running]);

  if (isLoading || !recipe) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <LoadingSpinner size="large" color={color.white} />
        </SafeAreaView>
      </View>
    );
  }

  const steps = recipe.instructions;
  const cur = steps[step];
  const isLast = step === steps.length - 1;
  const readyCount = Object.values(checked).filter(Boolean).length;

  const goToStep = (i: number) => {
    const n = Math.max(0, Math.min(steps.length - 1, i));
    setStep(n);
    setSec(steps[n].duration ? steps[n].duration! * 60 : 0);
    setRunning(false);
  };

  const finish = async () => {
    try {
      if (recipe.nutrition) {
        await fetch(`${API_URL}/analytics/meal-completion`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipeId: recipe.id,
            calories: recipe.nutrition.calories,
            protein: recipe.nutrition.protein,
            fiber: recipe.nutrition.fiber,
            servings: recipe.servings,
          }),
        });
      }

      const usedIngredientIds = Object.keys(checked).filter(k => checked[k]);
      await Promise.all(
        usedIngredientIds.map(ingId => {
          const ing = recipe.ingredients.find(i => i.id === ingId);
          if (!ing) return Promise.resolve();
          return fetch(`${API_URL}/analytics/waste-log`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              itemName: ing.name,
              category: 'other',
              action: 'used',
              quantity: ing.amount,
              unit: ing.unit,
            }),
          });
        })
      );
    } catch {
      // Logging failures shouldn't block finishing the cook — non-fatal.
    } finally {
      router.replace('/(tabs)');
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.flex}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Pressable
              style={styles.closeBtn}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Close cook mode"
            >
              <X size={18} color={color.white} strokeWidth={1.85} />
            </Pressable>
            <View style={styles.flex}>
              <Text preset="caption" color={onDark.textMuted} style={styles.eyebrow}>
                STEP {step + 1} OF {steps.length}
              </Text>
              <Text preset="labelMd" color={color.white} numberOfLines={1}>
                {recipe.title}
              </Text>
            </View>
          </View>
          <View style={styles.segments}>
            {steps.map((s, i) => (
              <View
                key={s.id}
                style={[
                  styles.segment,
                  { backgroundColor: i <= step ? color.white : onDark.hairline },
                ]}
              />
            ))}
          </View>
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={styles.bodyContent}>
          <Text preset="displayMd" color={color.white}>
            {cur.instruction}
          </Text>

          {cur.tip ? (
            <View style={styles.tipCard}>
              <View style={styles.tipAvatar}>
                <Text preset="caption" color={color.ink}>
                  P
                </Text>
              </View>
              <Text preset="bodyMd" color={onDark.text} style={styles.flex}>
                {cur.tip}
              </Text>
            </View>
          ) : null}

          {!!cur.duration && (
            <View style={styles.timerCard}>
              <View style={styles.flex}>
                <Text preset="caption" color={onDark.textMuted} style={styles.eyebrow}>
                  TIMER
                </Text>
                <Text preset="displayMd" color={color.white} style={styles.timerValue}>
                  {fmt(sec)}
                </Text>
              </View>
              <Pressable
                style={styles.timerBtn}
                onPress={() => setRunning(r => !r)}
                accessibilityRole="button"
              >
                <Text preset="labelMd" color={color.ink}>
                  {running ? 'Pause' : 'Start'}
                </Text>
              </Pressable>
            </View>
          )}

          <View>
            <Pressable
              style={styles.ingredientsToggle}
              onPress={() => setListOpen(o => !o)}
              accessibilityRole="button"
              accessibilityState={{ expanded: listOpen }}
            >
              <Text preset="labelMd" color={color.white}>
                Ingredients
              </Text>
              <Text preset="caption" color={onDark.textMuted}>
                {readyCount} of {recipe.ingredients.length} ready
              </Text>
              <View style={styles.caret}>
                {listOpen ? (
                  <ChevronDown size={18} color={onDark.textMuted} strokeWidth={1.85} />
                ) : (
                  <ChevronRight size={18} color={onDark.textMuted} strokeWidth={1.85} />
                )}
              </View>
            </Pressable>

            {listOpen && (
              <View style={styles.ingredientsList}>
                {recipe.ingredients.map((ing, i) => {
                  const on = !!checked[ing.id];
                  return (
                    <Pressable
                      key={ing.id}
                      style={[
                        styles.ingredientRow,
                        i < recipe.ingredients.length - 1 && styles.ingredientRowBorder,
                      ]}
                      onPress={() => setChecked(c => ({ ...c, [ing.id]: !c[ing.id] }))}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      <View style={[styles.checkbox, on && styles.checkboxOn]}>
                        {on ? <Check size={13} color={color.ink} strokeWidth={2.4} /> : null}
                      </View>
                      <Text
                        preset="bodyMd"
                        color={color.white}
                        style={[styles.flex, on && styles.checkedLabel]}
                      >
                        {ing.name}
                      </Text>
                      <Text preset="caption" color={onDark.textMuted}>
                        {ing.amount} {ing.unit}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={styles.backBtn}
            onPress={() => goToStep(step - 1)}
            disabled={step === 0}
            accessibilityRole="button"
          >
            <Text preset="labelMd" color={color.white} style={step === 0 && styles.disabled}>
              Back
            </Text>
          </Pressable>
          <Pressable
            style={styles.nextBtn}
            onPress={() => (isLast ? finish() : goToStep(step + 1))}
            accessibilityRole="button"
          >
            <Text preset="labelMd" color={color.ink}>
              {isLast ? 'Finish' : 'Next step'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.surfaceDark },
  flex: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    paddingHorizontal: space.md,
    paddingTop: space.xs,
    paddingBottom: space.sm,
    gap: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: onDark.hairline,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  closeBtn: {
    width: space.xl,
    height: space.xl,
    borderRadius: radius.full,
    backgroundColor: onDark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyebrow: { letterSpacing: 1.2 },
  segments: { flexDirection: 'row', gap: space.xxs },
  segment: { flex: 1, height: 4, borderRadius: radius.xs },

  bodyContent: { padding: space.lg, gap: space.lg },

  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: onDark.surface,
  },
  tipAvatar: {
    width: space.lg,
    height: space.lg,
    borderRadius: radius.full,
    backgroundColor: color.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerCard: {
    borderWidth: 1,
    borderColor: onDark.hairline,
    borderRadius: radius.md,
    padding: space.md,
    backgroundColor: onDark.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  timerValue: { fontVariant: ['tabular-nums'] },
  // On a dark surface the emphasised control is a solid white button.
  timerBtn: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    backgroundColor: color.white,
  },

  ingredientsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: onDark.surface,
  },
  caret: { marginLeft: 'auto' },
  ingredientsList: {
    borderRadius: radius.md,
    backgroundColor: onDark.surface,
    overflow: 'hidden',
    marginTop: space.xs,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  ingredientRowBorder: { borderBottomWidth: 1, borderBottomColor: onDark.hairline },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: onDark.hairline,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxOn: { backgroundColor: color.white, borderColor: color.white },
  checkedLabel: { textDecorationLine: 'line-through' },

  footer: {
    flexDirection: 'row',
    gap: space.xs,
    padding: space.md,
    borderTopWidth: 1,
    borderTopColor: onDark.hairline,
  },
  backBtn: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: onDark.hairline,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabled: { opacity: 0.4 },
  nextBtn: {
    flex: 1,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
