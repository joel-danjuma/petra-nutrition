import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useAuthStore } from '@petra/shared';
import { Colors } from '../../src/constants/Colors';
import { useColorScheme } from '../../src/hooks/useColorScheme';

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

const getApiUrl = () =>
  Platform.OS === 'android' ? 'http://10.0.2.2:3001/api' : 'http://localhost:3001/api';

const DIFFICULTY_COLORS: Record<string, string> = {
  EASY: '#10b981',
  MEDIUM: '#f59e0b',
  HARD: '#ef4444',
};

export default function RecipesScreen() {
  const colorScheme = useColorScheme();
  const token = useAuthStore(state => state.token);
  const colors = Colors[colorScheme ?? 'light'];
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const API_URL = getApiUrl();

  const fetchRecipes = useCallback(async (query: string) => {
    setIsLoading(true);
    setHasSearched(true);
    try {
      const params = query ? `?search=${encodeURIComponent(query)}&limit=20` : '?limit=20';
      const res = await fetch(`${API_URL}/recipes/search${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setRecipes(data.data?.recipes || data.data || []);
      }
    } catch {
      Alert.alert('Error', 'Failed to load recipes. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [token, API_URL]);

  const toggleFavorite = async (recipe: Recipe) => {
    try {
      const method = recipe.isFavorited ? 'DELETE' : 'POST';
      await fetch(`${API_URL}/recipes/${recipe.id}/favorite`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      setRecipes(prev =>
        prev.map(r => r.id === recipe.id ? { ...r, isFavorited: !r.isFavorited } : r)
      );
    } catch {
      Alert.alert('Error', 'Failed to update favorite.');
    }
  };

  const renderRecipe = ({ item }: { item: Recipe }) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={[styles.cardImagePlaceholder, { backgroundColor: colors.muted }]}>
          <Ionicons name="restaurant-outline" size={32} color={colors.tabIconDefault} />
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
          <TouchableOpacity onPress={() => toggleFavorite(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons
              name={item.isFavorited ? 'heart' : 'heart-outline'}
              size={22}
              color={item.isFavorited ? '#ef4444' : colors.tabIconDefault}
            />
          </TouchableOpacity>
        </View>

        {item.description ? (
          <Text style={[styles.cardDesc, { color: colors.tabIconDefault }]} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}

        <View style={styles.cardMeta}>
          {item.difficulty ? (
            <View style={[styles.badge, { backgroundColor: DIFFICULTY_COLORS[item.difficulty] + '20' }]}>
              <Text style={[styles.badgeText, { color: DIFFICULTY_COLORS[item.difficulty] || colors.text }]}>
                {item.difficulty}
              </Text>
            </View>
          ) : null}
          {item.cuisine ? (
            <View style={[styles.badge, { backgroundColor: colors.muted }]}>
              <Text style={[styles.badgeText, { color: colors.tabIconDefault }]}>{item.cuisine}</Text>
            </View>
          ) : null}
          {item.prepTime || item.cookTime ? (
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={14} color={colors.tabIconDefault} />
              <Text style={[styles.timeText, { color: colors.tabIconDefault }]}>
                {(item.prepTime || 0) + (item.cookTime || 0)} min
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Recipes</Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={20} color={colors.tabIconDefault} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search recipes, cuisines..."
            placeholderTextColor={colors.tabIconDefault}
            returnKeyType="search"
            onSubmitEditing={() => fetchRecipes(search)}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={colors.tabIconDefault} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.searchButton, { backgroundColor: colors.tint }]}
          onPress={() => fetchRecipes(search)}
        >
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : !hasSearched ? (
        <View style={styles.centered}>
          <Ionicons name="book-outline" size={64} color={colors.tabIconDefault} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Find Recipes</Text>
          <Text style={[styles.emptyDesc, { color: colors.tabIconDefault }]}>
            Search for recipes or browse popular dishes
          </Text>
          <TouchableOpacity
            style={[styles.browseButton, { borderColor: colors.tint }]}
            onPress={() => fetchRecipes('')}
          >
            <Text style={[styles.browseButtonText, { color: colors.tint }]}>Browse All</Text>
          </TouchableOpacity>
        </View>
      ) : recipes.length === 0 ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No recipes found</Text>
          <Text style={[styles.emptyDesc, { color: colors.tabIconDefault }]}>Try a different search term</Text>
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
  container: { flex: 1 },
  header: { borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  searchContainer: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16 },
  searchButton: { paddingHorizontal: 16, height: 44, borderRadius: 12, justifyContent: 'center' },
  searchButtonText: { color: 'white', fontWeight: '600', fontSize: 15 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  card: { borderWidth: 1, borderRadius: 16, marginBottom: 16, overflow: 'hidden' },
  cardImage: { width: '100%', height: 180 },
  cardImagePlaceholder: { width: '100%', height: 120, justifyContent: 'center', alignItems: 'center' },
  cardBody: { padding: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '600', marginRight: 8 },
  cardDesc: { fontSize: 14, marginBottom: 8 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 12, fontWeight: '500' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  timeText: { fontSize: 12 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  emptyDesc: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  browseButton: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 10, borderWidth: 1.5, borderRadius: 12 },
  browseButtonText: { fontSize: 15, fontWeight: '600' },
});
