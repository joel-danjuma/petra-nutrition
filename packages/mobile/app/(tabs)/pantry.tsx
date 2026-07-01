import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { usePantry } from '@petra/shared';
import { Colors } from '../../src/constants/Colors';
import { useColorScheme } from '../../src/hooks/useColorScheme';
import { PantryItemCard } from '../../src/components/PantryItemCard';
import { SearchBar } from '../../src/components/SearchBar';
import { FloatingActionButton } from '../../src/components/FloatingActionButton';

export default function PantryScreen() {
  const colorScheme = useColorScheme();
  const { items, isLoading, fetchItems, deleteItem } = usePantry();
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = [
    { id: 'all', name: 'All', icon: 'grid-outline' },
    { id: 'produce', name: 'Produce', icon: 'leaf-outline' },
    { id: 'dairy', name: 'Dairy', icon: 'nutrition-outline' },
    { id: 'meat', name: 'Meat', icon: 'restaurant-outline' },
    { id: 'pantry_staples', name: 'Pantry', icon: 'archive-outline' },
    { id: 'frozen', name: 'Frozen', icon: 'snow-outline' },
  ];

  useEffect(() => {
    fetchItems();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchItems();
    setRefreshing(false);
  };

  const handleDeleteItem = async (itemId: string) => {
    Alert.alert(
      'Delete Item',
      'Are you sure you want to delete this item?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteItem(itemId),
        },
      ]
    );
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || selectedCategory === 'all' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const expiringSoonCount = items.filter(item => {
    if (!item.expirationDate) return false;
    const daysUntilExpiry = Math.ceil(
      (new Date(item.expirationDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiry <= 3 && daysUntilExpiry >= 0;
  }).length;

  const lowStockCount = items.filter(item => item.isLowStock).length;

  const renderCategoryFilter = () => (
    <View style={styles.categoryContainer}>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={categories}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.categoryButton,
              {
                backgroundColor: selectedCategory === item.id || (selectedCategory === null && item.id === 'all')
                  ? Colors[colorScheme ?? 'light'].tint
                  : Colors[colorScheme ?? 'light'].card,
                borderColor: Colors[colorScheme ?? 'light'].border,
              },
            ]}
            onPress={() => setSelectedCategory(item.id === 'all' ? null : item.id)}
          >
            <Ionicons
              name={item.icon as any}
              size={20}
              color={
                selectedCategory === item.id || (selectedCategory === null && item.id === 'all')
                  ? 'white'
                  : Colors[colorScheme ?? 'light'].text
              }
            />
            <Text
              style={[
                styles.categoryText,
                {
                  color: selectedCategory === item.id || (selectedCategory === null && item.id === 'all')
                    ? 'white'
                    : Colors[colorScheme ?? 'light'].text,
                },
              ]}
            >
              {item.name}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );

  const renderAlerts = () => {
    if (expiringSoonCount === 0 && lowStockCount === 0) return null;

    return (
      <View style={[styles.alertsContainer, { backgroundColor: Colors[colorScheme ?? 'light'].card }]}>
        {expiringSoonCount > 0 && (
          <TouchableOpacity
            style={[styles.alertButton, { backgroundColor: Colors[colorScheme ?? 'light'].warning + '20' }]}
            onPress={() => {
              // Filter to show expiring items
              setSelectedCategory(null);
              setSearchQuery('');
            }}
          >
            <Ionicons name="warning-outline" size={20} color={Colors[colorScheme ?? 'light'].warning} />
            <Text style={[styles.alertText, { color: Colors[colorScheme ?? 'light'].warning }]}>
              {expiringSoonCount} item{expiringSoonCount > 1 ? 's' : ''} expiring soon
            </Text>
          </TouchableOpacity>
        )}
        
        {lowStockCount > 0 && (
          <TouchableOpacity
            style={[styles.alertButton, { backgroundColor: Colors[colorScheme ?? 'light'].destructive + '20' }]}
            onPress={() => {
              // Filter to show low stock items
              setSelectedCategory(null);
              setSearchQuery('');
            }}
          >
            <Ionicons name="alert-circle-outline" size={20} color={Colors[colorScheme ?? 'light'].destructive} />
            <Text style={[styles.alertText, { color: Colors[colorScheme ?? 'light'].destructive }]}>
              {lowStockCount} item{lowStockCount > 1 ? 's' : ''} low in stock
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons
        name="archive-outline"
        size={64}
        color={Colors[colorScheme ?? 'light'].tabIconDefault}
      />
      <Text style={[styles.emptyTitle, { color: Colors[colorScheme ?? 'light'].text }]}>
        Your pantry is empty
      </Text>
      <Text style={[styles.emptySubtitle, { color: Colors[colorScheme ?? 'light'].tabIconDefault }]}>
        Start by scanning a barcode or adding items manually
      </Text>
      <TouchableOpacity
        style={[styles.emptyButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}
        onPress={() => router.push('/pantry/add')}
      >
        <Text style={styles.emptyButtonText}>Add Your First Item</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: Colors[colorScheme ?? 'light'].text }]}>
          My Pantry
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.headerButton, { backgroundColor: Colors[colorScheme ?? 'light'].card }]}
            onPress={() => router.push('/pantry/stats')}
          >
            <Ionicons name="stats-chart-outline" size={20} color={Colors[colorScheme ?? 'light'].text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerButton, { backgroundColor: Colors[colorScheme ?? 'light'].card }]}
            onPress={() => router.push('/pantry/settings')}
          >
            <Ionicons name="settings-outline" size={20} color={Colors[colorScheme ?? 'light'].text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <SearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search pantry items..."
      />

      {/* Alerts */}
      {renderAlerts()}

      {/* Category Filters */}
      {renderCategoryFilter()}

      {/* Items List */}
      <FlatList
        data={filteredItems}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <PantryItemCard
            item={item}
            onPress={() => router.push(`/pantry/${item.id}`)}
            onDelete={() => handleDeleteItem(item.id)}
            onEdit={() => router.push(`/pantry/${item.id}/edit`)}
          />
        )}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors[colorScheme ?? 'light'].tint}
          />
        }
        ListEmptyComponent={!isLoading ? renderEmptyState : null}
      />

      {/* Floating Action Button */}
      <FloatingActionButton
        onPress={() => {
          Alert.alert(
            'Add Item',
            'How would you like to add this item?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Scan Barcode',
                onPress: () => router.push('/pantry/scan/barcode'),
              },
              {
                text: 'Take Photo',
                onPress: () => router.push('/pantry/scan/camera'),
              },
              {
                text: 'Add Manually',
                onPress: () => router.push('/pantry/add'),
              },
            ]
          );
        }}
        icon="add"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    gap: 6,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '500',
  },
  alertsContainer: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  alertButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  alertText: {
    fontSize: 14,
    fontWeight: '500',
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 100, // Space for FAB
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
