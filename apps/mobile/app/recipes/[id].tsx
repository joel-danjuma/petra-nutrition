import { useState, useEffect, useMemo } from 'react';
import { View, ScrollView, Image, Pressable, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronLeft, Heart, Plus, UtensilsCrossed } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuthStore, usePantry } from '@petra/shared';

import { color, radius, semantic, space } from '../../src/theme';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { Chip } from '../../src/components/ui/Chip';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';
import { Text } from '../../src/components/ui/Text';
import { Callout } from '../../src/components/ui/Callout';
import { API_URL } from '../../src/config/api';

interface RecipeIngredient {
  id: string;
  name: string;
  amount: number;
  unit: string;
  notes?: string;
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
  description?: string;
  imageUrl?: string;
  servings: number;
  prepTime: number;
  cookTime: number;
  totalTime: number;
  difficulty: string;
  dietaryTags: string[];
  ingredients: RecipeIngredient[];
  instructions: RecipeInstruction[];
  nutrition?: { calories: number; protein: number; fiber?: number; sodium?: number };
  safetyNote?: string | null;
  zeroWasteNote?: string | null;
  isAIGenerated?: boolean;
  isFavorited?: boolean;
}

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useAuthStore(state => state.token);
  const { items: pantryItems } = usePantry();
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/recipes/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!cancelled && data.success) setRecipe(data.data);
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

  const pantryNames = useMemo(
    () => pantryItems.map(p => p.name.toLowerCase().trim()),
    [pantryItems]
  );

  const inPantry = (name: string) =>
    pantryNames.some(n => n.includes(name.toLowerCase()) || name.toLowerCase().includes(n));

  const haveCount = useMemo(
    () => (recipe ? recipe.ingredients.filter(ing => inPantry(ing.name)).length : 0),
    [recipe, pantryNames]
  );

  const toggleFavorite = async () => {
    if (!recipe) return;
    try {
      const method = recipe.isFavorited ? 'DELETE' : 'POST';
      await fetch(`${API_URL}/recipes/${recipe.id}/favorite`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      setRecipe(prev => (prev ? { ...prev, isFavorited: !prev.isFavorited } : prev));
    } catch {
      Alert.alert('Error', 'Failed to update favorite.');
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <LoadingSpinner size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!recipe) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text preset="titleMd">Recipe not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const missingCount = recipe.ingredients.length - haveCount;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {recipe.imageUrl ? (
            <Image source={{ uri: recipe.imageUrl }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]}>
              <UtensilsCrossed size={40} color={color.muted} strokeWidth={1.5} />
            </View>
          )}
          <SafeAreaView style={styles.heroOverlay} edges={['top']}>
            <Pressable
              style={styles.heroButton}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ChevronLeft size={20} color={color.ink} strokeWidth={1.85} />
            </Pressable>
            <Pressable
              style={styles.heroButton}
              onPress={toggleFavorite}
              accessibilityRole="button"
              accessibilityLabel={recipe.isFavorited ? 'Remove from favourites' : 'Save recipe'}
            >
              <Heart
                size={18}
                color={recipe.isFavorited ? semantic.danger : color.ink}
                fill={recipe.isFavorited ? semantic.danger : 'transparent'}
                strokeWidth={1.85}
              />
            </Pressable>
          </SafeAreaView>
        </View>

        <View style={styles.body}>
          {recipe.isAIGenerated ? (
            <Text preset="caption" style={styles.eyebrow}>
              INVENTED FOR YOUR PANTRY
            </Text>
          ) : null}
          <Text preset="titleLg">{recipe.title}</Text>
          {recipe.description ? <Text preset="bodyMd">{recipe.description}</Text> : null}

          <View style={styles.tagRow}>
            {recipe.totalTime > 0 ? <Chip label={`${recipe.totalTime} min`} /> : null}
            <Chip label={`Serves ${recipe.servings}`} />
            {recipe.dietaryTags.map(tag => (
              <Chip key={tag} label={tag} />
            ))}
          </View>

          {recipe.nutrition && (
            <Card padded={false} style={styles.macrosGrid}>
              <View style={styles.macroCell}>
                <Text preset="titleSm">{Math.round(recipe.nutrition.calories)}</Text>
                <Text preset="caption">kcal</Text>
              </View>
              <View style={styles.macroCell}>
                <Text preset="titleSm">{Math.round(recipe.nutrition.protein)}g</Text>
                <Text preset="caption">protein</Text>
              </View>
              {recipe.nutrition.fiber != null && (
                <View style={styles.macroCell}>
                  <Text preset="titleSm">{Math.round(recipe.nutrition.fiber)}g</Text>
                  <Text preset="caption">fibre</Text>
                </View>
              )}
              {recipe.nutrition.sodium != null && (
                <View style={styles.macroCellLast}>
                  <Text preset="titleSm">{Math.round(recipe.nutrition.sodium)}</Text>
                  <Text preset="caption">mg salt</Text>
                </View>
              )}
            </Card>
          )}

          {recipe.safetyNote ? <Callout tone="safety">{recipe.safetyNote}</Callout> : null}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text preset="titleSm">Ingredients</Text>
              <Text preset="caption">
                {haveCount} of {recipe.ingredients.length} in your pantry
              </Text>
            </View>
            <Card padded={false}>
              {recipe.ingredients.map((ing, i) => {
                const have = inPantry(ing.name);
                return (
                  <View
                    key={ing.id}
                    style={[
                      styles.ingredientRow,
                      i < recipe.ingredients.length - 1 && styles.rowDivider,
                    ]}
                  >
                    <View style={[styles.ingredientDot, have && styles.ingredientDotOn]}>
                      {have ? (
                        <Check size={11} color={color.white} strokeWidth={2.4} />
                      ) : (
                        <Plus size={11} color={color.muted} strokeWidth={2.4} />
                      )}
                    </View>
                    <Text preset="labelMd" color={color.ink} style={styles.flex}>
                      {ing.name}
                    </Text>
                    <Text preset="caption">
                      {ing.amount} {ing.unit}
                    </Text>
                  </View>
                );
              })}
            </Card>
            {missingCount > 0 && (
              <Button variant="secondary" onPress={() => router.push('/shopping')} fullWidth>
                {`Add the ${missingCount} missing to my list`}
              </Button>
            )}
          </View>

          {recipe.zeroWasteNote ? (
            <Callout tone="zeroWaste">{recipe.zeroWasteNote}</Callout>
          ) : null}

          <View style={styles.section}>
            <Text preset="titleSm">Method</Text>
            {recipe.instructions.slice(0, 3).map(step => (
              <View key={step.id} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text preset="caption" color={color.ink}>
                    {step.step}
                  </Text>
                </View>
                <Text preset="bodyMd" style={styles.flex}>
                  {step.instruction}
                </Text>
              </View>
            ))}
            {recipe.instructions.length > 3 && (
              <Text preset="caption" style={styles.stepMore}>
                + {recipe.instructions.length - 3} more steps in cook mode
              </Text>
            )}
          </View>
        </View>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <Button onPress={() => router.push(`/recipes/${recipe.id}/cook`)} fullWidth>
          Start cooking · hands-free
        </Button>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.canvas },
  flex: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // Hero imagery bleeds full-width with no rounding, per the system's imagery rules.
  hero: { height: 260, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: {
    backgroundColor: color.surfaceSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
    paddingTop: space.xxs,
  },
  // Icon buttons are circular, white, hairline-bordered with an ink glyph.
  heroButton: {
    width: space.xl + space.xxs,
    height: space.xl + space.xxs,
    borderRadius: radius.full,
    backgroundColor: color.canvas,
    borderWidth: 1,
    borderColor: color.hairline,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: { padding: space.lg, gap: space.md },
  eyebrow: { letterSpacing: 1.2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  macrosGrid: { flexDirection: 'row' },
  macroCell: {
    flex: 1,
    paddingVertical: space.sm,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: color.hairline,
  },
  macroCellLast: { flex: 1, paddingVertical: space.sm, alignItems: 'center' },
  section: { gap: space.sm },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: color.hairline },
  ingredientDot: {
    width: 18,
    height: 18,
    borderRadius: radius.full,
    backgroundColor: color.surfaceStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ingredientDotOn: { backgroundColor: color.ink },
  stepRow: { flexDirection: 'row', gap: space.sm },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: color.surfaceStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepMore: { paddingLeft: space.xl },
  footer: {
    padding: space.md,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
    backgroundColor: color.canvas,
  },
});
