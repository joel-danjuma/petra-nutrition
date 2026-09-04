import { useState, useCallback } from 'react';
import { View, FlatList, Pressable, StyleSheet, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookOpen, ChevronLeft, Clock, Heart, UtensilsCrossed } from 'lucide-react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@petra/shared';

import { color, radius, semantic, space } from '../../src/theme';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { Chip } from '../../src/components/ui/Chip';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';
import { SearchBar } from '../../src/components/SearchBar';
import { Text } from '../../src/components/ui/Text';
import { API_URL } from '../../src/config/api';

interface Recipe {
  id: string;
  title: string;
  description?: string;
  cuisine?: string;
  difficulty?: string;
  prepTime?: number;
  cookTime?: number;
  servings?: number;
  imageUrl?: string;
  isFavorited?: boolean;
}

export default function RecipeSearchScreen() {
  const token = useAuthStore(state => state.token);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const fetchRecipes = useCallback(
    async (query: string) => {
      setIsLoading(true);
      setHasSearched(true);
      try {
        const params = query ? `?search=${encodeURIComponent(query)}&limit=20` : '?limit=20';
        const res = await fetch(`${API_URL}/recipes/search${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) setRecipes(data.data?.recipes || data.data || []);
      } catch {
        Alert.alert('Error', 'Failed to load recipes. Please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [token]
  );

  const toggleFavorite = async (recipe: Recipe) => {
    try {
      const method = recipe.isFavorited ? 'DELETE' : 'POST';
      await fetch(`${API_URL}/recipes/${recipe.id}/favorite`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      setRecipes(prev =>
        prev.map(r => (r.id === recipe.id ? { ...r, isFavorited: !r.isFavorited } : r))
      );
    } catch {
      Alert.alert('Error', 'Failed to update favorite.');
    }
  };

  const renderRecipe = ({ item }: { item: Recipe }) => (
    <Card padded={false} style={styles.card} onPress={() => router.push(`/recipes/${item.id}`)}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={styles.cardImagePlaceholder}>
          <UtensilsCrossed size={28} color={color.muted} strokeWidth={1.5} />
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <Text preset="titleSm" style={styles.flex} numberOfLines={2}>
            {item.title}
          </Text>
          <Pressable
            onPress={() => toggleFavorite(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={item.isFavorited ? 'Remove from favourites' : 'Save recipe'}
          >
            <Heart
              size={20}
              color={item.isFavorited ? semantic.danger : color.muted}
              fill={item.isFavorited ? semantic.danger : 'transparent'}
              strokeWidth={1.85}
            />
          </Pressable>
        </View>

        {item.description ? (
          <Text preset="bodyMd" numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}

        <View style={styles.cardMeta}>
          {item.difficulty ? <Chip label={item.difficulty.toLowerCase()} /> : null}
          {item.cuisine ? <Chip label={item.cuisine} /> : null}
          {item.prepTime || item.cookTime ? (
            <View style={styles.timeRow}>
              <Clock size={14} color={color.muted} strokeWidth={1.85} />
              <Text preset="caption">{(item.prepTime || 0) + (item.cookTime || 0)} min</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );

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
        <Text preset="titleLg">Find recipes</Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.flex}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search recipes and cuisines"
          />
        </View>
        <Button size="sm" onPress={() => fetchRecipes(search)}>
          Search
        </Button>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <LoadingSpinner size="large" />
        </View>
      ) : !hasSearched ? (
        <View style={styles.centered}>
          <BookOpen size={40} color={color.muted} strokeWidth={1.5} />
          <Text preset="titleMd" align="center">
            Find recipes
          </Text>
          <Text preset="bodyMd" align="center">
            Search for something specific, or browse what Petra can make.
          </Text>
          <Button variant="secondary" onPress={() => fetchRecipes('')} style={styles.browseCta}>
            Browse all
          </Button>
        </View>
      ) : recipes.length === 0 ? (
        <View style={styles.centered}>
          <Text preset="titleMd" align="center">
            No recipes found
          </Text>
          <Text preset="bodyMd" align="center">
            Try a different search term.
          </Text>
        </View>
      ) : (
        <FlatList
          data={recipes}
          renderItem={renderRecipe}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
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
    paddingVertical: space.sm,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.xs,
  },
  list: { paddingHorizontal: space.md, paddingBottom: space.lg },
  card: { marginBottom: space.md, overflow: 'hidden' },
  cardImage: { width: '100%', height: 180 },
  cardImagePlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: color.surfaceSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: { padding: space.sm, gap: space.xs },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.xs,
  },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, alignItems: 'center' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.xl,
    gap: space.sm,
  },
  browseCta: { marginTop: space.sm },
});
