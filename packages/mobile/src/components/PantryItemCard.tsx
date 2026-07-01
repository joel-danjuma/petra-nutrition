import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { useColorScheme } from '../hooks/useColorScheme';

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

export function PantryItemCard({ item, onPress, onDelete, onEdit }: PantryItemCardProps) {
  const colorScheme = useColorScheme();

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      produce: 'leaf-outline',
      dairy: 'nutrition-outline',
      meat: 'restaurant-outline',
      seafood: 'fish-outline',
      grains: 'basket-outline',
      pantry_staples: 'archive-outline',
      spices: 'flower-outline',
      condiments: 'wine-outline',
      beverages: 'cafe-outline',
      frozen: 'snow-outline',
      canned: 'library-outline',
      snacks: 'fast-food-outline',
      other: 'ellipse-outline',
    };
    return icons[category] || 'ellipse-outline';
  };

  const getExpirationStatus = () => {
    if (!item.expirationDate) return null;
    
    const today = new Date();
    const expDate = new Date(item.expirationDate);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { status: 'expired', color: Colors[colorScheme ?? 'light'].destructive, text: 'Expired' };
    } else if (diffDays === 0) {
      return { status: 'today', color: Colors[colorScheme ?? 'light'].warning, text: 'Expires today' };
    } else if (diffDays <= 3) {
      return { status: 'soon', color: Colors[colorScheme ?? 'light'].warning, text: `${diffDays} day${diffDays > 1 ? 's' : ''} left` };
    } else if (diffDays <= 7) {
      return { status: 'week', color: Colors[colorScheme ?? 'light'].success, text: `${diffDays} days left` };
    }
    return null;
  };

  const expirationStatus = getExpirationStatus();

  const handleLongPress = () => {
    Alert.alert(
      item.name,
      'What would you like to do?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Edit', onPress: onEdit },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]
    );
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: Colors[colorScheme ?? 'light'].card,
          borderColor: Colors[colorScheme ?? 'light'].border,
        },
      ]}
      onPress={onPress}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <View
            style={[
              styles.categoryIcon,
              { backgroundColor: Colors[colorScheme ?? 'light'].tint + '20' },
            ]}
          >
            <Ionicons
              name={getCategoryIcon(item.category) as any}
              size={20}
              color={Colors[colorScheme ?? 'light'].tint}
            />
          </View>
          <View style={styles.titleText}>
            <Text
              style={[styles.name, { color: Colors[colorScheme ?? 'light'].text }]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            {item.brand && (
              <Text
                style={[styles.brand, { color: Colors[colorScheme ?? 'light'].tabIconDefault }]}
                numberOfLines={1}
              >
                {item.brand}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.quantity}>
          <Text style={[styles.quantityText, { color: Colors[colorScheme ?? 'light'].text }]}>
            {item.quantity}
          </Text>
          <Text style={[styles.unit, { color: Colors[colorScheme ?? 'light'].tabIconDefault }]}>
            {item.unit}
          </Text>
        </View>
      </View>

      {/* Status Indicators */}
      <View style={styles.statusContainer}>
        <View style={styles.location}>
          <Ionicons
            name="location-outline"
            size={14}
            color={Colors[colorScheme ?? 'light'].tabIconDefault}
          />
          <Text style={[styles.locationText, { color: Colors[colorScheme ?? 'light'].tabIconDefault }]}>
            {item.location}
          </Text>
        </View>

        <View style={styles.indicators}>
          {item.isLowStock && (
            <View
              style={[
                styles.indicator,
                { backgroundColor: Colors[colorScheme ?? 'light'].destructive + '20' },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={12}
                color={Colors[colorScheme ?? 'light'].destructive}
              />
              <Text
                style={[styles.indicatorText, { color: Colors[colorScheme ?? 'light'].destructive }]}
              >
                Low Stock
              </Text>
            </View>
          )}

          {expirationStatus && (
            <View
              style={[
                styles.indicator,
                { backgroundColor: expirationStatus.color + '20' },
              ]}
            >
              <Ionicons
                name="time-outline"
                size={12}
                color={expirationStatus.color}
              />
              <Text
                style={[styles.indicatorText, { color: expirationStatus.color }]}
              >
                {expirationStatus.text}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  titleText: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  brand: {
    fontSize: 14,
  },
  quantity: {
    alignItems: 'flex-end',
  },
  quantityText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  unit: {
    fontSize: 12,
    marginTop: 2,
  },
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  location: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 12,
    textTransform: 'capitalize',
  },
  indicators: {
    flexDirection: 'row',
    gap: 6,
  },
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  indicatorText: {
    fontSize: 10,
    fontWeight: '500',
  },
});
