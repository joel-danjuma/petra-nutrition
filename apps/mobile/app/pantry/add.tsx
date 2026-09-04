import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePantry } from '@petra/shared';
import { Colors } from '../../src/constants/Colors';
import { useColorScheme } from '../../src/hooks/useColorScheme';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';

const categories = [
  { id: 'produce', name: 'Produce', icon: 'leaf-outline' },
  { id: 'dairy', name: 'Dairy', icon: 'nutrition-outline' },
  { id: 'meat', name: 'Meat', icon: 'restaurant-outline' },
  { id: 'seafood', name: 'Seafood', icon: 'fish-outline' },
  { id: 'grains', name: 'Grains', icon: 'basket-outline' },
  { id: 'pantry_staples', name: 'Pantry', icon: 'archive-outline' },
  { id: 'spices', name: 'Spices', icon: 'flower-outline' },
  { id: 'condiments', name: 'Condiments', icon: 'wine-outline' },
  { id: 'beverages', name: 'Beverages', icon: 'cafe-outline' },
  { id: 'frozen', name: 'Frozen', icon: 'snow-outline' },
  { id: 'canned', name: 'Canned', icon: 'library-outline' },
  { id: 'snacks', name: 'Snacks', icon: 'fast-food-outline' },
  { id: 'other', name: 'Other', icon: 'ellipse-outline' },
];

const locations = [
  'Pantry', 'Refrigerator', 'Freezer', 'Cabinet', 'Countertop', 'Other'
];

const units = [
  'piece', 'lb', 'oz', 'kg', 'g', 'cup', 'tbsp', 'tsp', 'ml', 'l', 'qt', 'pt', 'gal', 'can', 'box', 'bag', 'bottle', 'jar'
];

export default function AddPantryItemScreen() {
  const colorScheme = useColorScheme();
  const { addItem } = usePantry();
  const params = useLocalSearchParams();
  
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    quantity: '1',
    unit: 'piece',
    category: 'other',
    location: 'Pantry',
    brand: '',
    notes: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    expirationDate: '',
    lowStockThreshold: '1',
  });

  useEffect(() => {
    if (params.barcode) {
      handleBarcodeData(params.barcode as string);
    }
    if (params.photoUri || params.photoBase64) {
      handleImageData(params.photoUri as string, params.photoBase64 as string);
    }
  }, [params]);

  const handleBarcodeData = async (barcode: string) => {
    setIsProcessingImage(true);
    try {
      // Here you would call your API to lookup barcode data
      // For now, we'll simulate the process
      console.log('Processing barcode:', barcode);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock barcode lookup result
      const mockProduct = {
        name: 'Sample Product',
        brand: 'Sample Brand',
        category: 'pantry_staples',
      };
      
      setFormData(prev => ({
        ...prev,
        name: mockProduct.name,
        brand: mockProduct.brand,
        category: mockProduct.category,
      }));
      
    } catch (error) {
      console.error('Error processing barcode:', error);
      Alert.alert('Error', 'Failed to lookup barcode. Please enter details manually.');
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleImageData = async (photoUri: string, photoBase64?: string) => {
    setIsProcessingImage(true);
    try {
      // Here you would call your AI image recognition API
      // For now, we'll simulate the process
      console.log('Processing image:', photoUri);
      
      // Simulate AI processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mock AI recognition result
      const mockRecognition = {
        name: 'Fresh Apple',
        category: 'produce',
        confidence: 0.85,
      };
      
      setFormData(prev => ({
        ...prev,
        name: mockRecognition.name,
        category: mockRecognition.category,
        location: 'Refrigerator', // Smart suggestion based on category
      }));
      
    } catch (error) {
      console.error('Error processing image:', error);
      Alert.alert('Error', 'Failed to recognize item. Please enter details manually.');
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Please enter an item name');
      return;
    }

    if (!formData.quantity || isNaN(Number(formData.quantity))) {
      Alert.alert('Error', 'Please enter a valid quantity');
      return;
    }

    setIsLoading(true);

    try {
      const itemData = {
        ...formData,
        quantity: Number(formData.quantity),
        lowStockThreshold: Number(formData.lowStockThreshold),
        purchaseDate: formData.purchaseDate ? new Date(formData.purchaseDate) : new Date(),
        expirationDate: formData.expirationDate ? new Date(formData.expirationDate) : undefined,
        isLowStock: Number(formData.quantity) <= Number(formData.lowStockThreshold),
      };

      await addItem(itemData);
      
      Alert.alert(
        'Success',
        'Item added to your pantry!',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error) {
      console.error('Error adding item:', error);
      Alert.alert('Error', 'Failed to add item. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderCategorySelector = () => (
    <View style={styles.sectionContainer}>
      <Text style={[styles.sectionTitle, { color: Colors[colorScheme ?? 'light'].text }]}>
        Category
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
        {categories.map(category => (
          <TouchableOpacity
            key={category.id}
            style={[
              styles.categoryButton,
              {
                backgroundColor: formData.category === category.id
                  ? Colors[colorScheme ?? 'light'].tint
                  : Colors[colorScheme ?? 'light'].card,
                borderColor: Colors[colorScheme ?? 'light'].border,
              },
            ]}
            onPress={() => setFormData(prev => ({ ...prev, category: category.id }))}
          >
            <Ionicons
              name={category.icon as any}
              size={20}
              color={
                formData.category === category.id
                  ? 'white'
                  : Colors[colorScheme ?? 'light'].text
              }
            />
            <Text
              style={[
                styles.categoryText,
                {
                  color: formData.category === category.id
                    ? 'white'
                    : Colors[colorScheme ?? 'light'].text,
                },
              ]}
            >
              {category.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderLocationSelector = () => (
    <View style={styles.sectionContainer}>
      <Text style={[styles.sectionTitle, { color: Colors[colorScheme ?? 'light'].text }]}>
        Location
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.locationScroll}>
        {locations.map(location => (
          <TouchableOpacity
            key={location}
            style={[
              styles.locationButton,
              {
                backgroundColor: formData.location === location
                  ? Colors[colorScheme ?? 'light'].tint
                  : Colors[colorScheme ?? 'light'].card,
                borderColor: Colors[colorScheme ?? 'light'].border,
              },
            ]}
            onPress={() => setFormData(prev => ({ ...prev, location }))}
          >
            <Text
              style={[
                styles.locationText,
                {
                  color: formData.location === location
                    ? 'white'
                    : Colors[colorScheme ?? 'light'].text,
                },
              ]}
            >
              {location}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  if (isProcessingImage) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
        <View style={styles.loadingContainer}>
          <LoadingSpinner size="large" />
          <Text style={[styles.loadingText, { color: Colors[colorScheme ?? 'light'].text }]}>
            {params.barcode ? 'Looking up product...' : 'Recognizing food item...'}
          </Text>
          <Text style={[styles.loadingSubtext, { color: Colors[colorScheme ?? 'light'].tabIconDefault }]}>
            This may take a few seconds
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={Colors[colorScheme ?? 'light'].text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors[colorScheme ?? 'light'].text }]}>
            Add Item
          </Text>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isLoading}
          >
            <Text style={[styles.saveButton, { color: Colors[colorScheme ?? 'light'].tint }]}>
              {isLoading ? 'Saving...' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Photo Preview */}
          {params.photoUri && (
            <View style={styles.photoContainer}>
              <Image source={{ uri: params.photoUri as string }} style={styles.photoPreview} />
            </View>
          )}

          {/* Basic Info */}
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, { color: Colors[colorScheme ?? 'light'].text }]}>
              Basic Information
            </Text>
            
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: Colors[colorScheme ?? 'light'].text }]}>
                Item Name *
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: Colors[colorScheme ?? 'light'].card,
                    borderColor: Colors[colorScheme ?? 'light'].border,
                    color: Colors[colorScheme ?? 'light'].text,
                  },
                ]}
                value={formData.name}
                onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
                placeholder="e.g., Organic Bananas"
                placeholderTextColor={Colors[colorScheme ?? 'light'].tabIconDefault}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={[styles.inputLabel, { color: Colors[colorScheme ?? 'light'].text }]}>
                  Quantity *
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: Colors[colorScheme ?? 'light'].card,
                      borderColor: Colors[colorScheme ?? 'light'].border,
                      color: Colors[colorScheme ?? 'light'].text,
                    },
                  ]}
                  value={formData.quantity}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, quantity: text }))}
                  placeholder="1"
                  keyboardType="numeric"
                  placeholderTextColor={Colors[colorScheme ?? 'light'].tabIconDefault}
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={[styles.inputLabel, { color: Colors[colorScheme ?? 'light'].text }]}>
                  Unit
                </Text>
                <TouchableOpacity
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: Colors[colorScheme ?? 'light'].card,
                      borderColor: Colors[colorScheme ?? 'light'].border,
                      justifyContent: 'center',
                    },
                  ]}
                  onPress={() => {
                    Alert.alert(
                      'Select Unit',
                      '',
                      units.map(unit => ({
                        text: unit,
                        onPress: () => setFormData(prev => ({ ...prev, unit })),
                      }))
                    );
                  }}
                >
                  <Text style={[styles.pickerText, { color: Colors[colorScheme ?? 'light'].text }]}>
                    {formData.unit}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: Colors[colorScheme ?? 'light'].text }]}>
                Brand (Optional)
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: Colors[colorScheme ?? 'light'].card,
                    borderColor: Colors[colorScheme ?? 'light'].border,
                    color: Colors[colorScheme ?? 'light'].text,
                  },
                ]}
                value={formData.brand}
                onChangeText={(text) => setFormData(prev => ({ ...prev, brand: text }))}
                placeholder="e.g., Organic Valley"
                placeholderTextColor={Colors[colorScheme ?? 'light'].tabIconDefault}
              />
            </View>
          </View>

          {/* Category Selection */}
          {renderCategorySelector()}

          {/* Location Selection */}
          {renderLocationSelector()}

          {/* Dates */}
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, { color: Colors[colorScheme ?? 'light'].text }]}>
              Dates
            </Text>
            
            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={[styles.inputLabel, { color: Colors[colorScheme ?? 'light'].text }]}>
                  Purchase Date
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: Colors[colorScheme ?? 'light'].card,
                      borderColor: Colors[colorScheme ?? 'light'].border,
                      color: Colors[colorScheme ?? 'light'].text,
                    },
                  ]}
                  value={formData.purchaseDate}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, purchaseDate: text }))}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors[colorScheme ?? 'light'].tabIconDefault}
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={[styles.inputLabel, { color: Colors[colorScheme ?? 'light'].text }]}>
                  Expiration Date
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: Colors[colorScheme ?? 'light'].card,
                      borderColor: Colors[colorScheme ?? 'light'].border,
                      color: Colors[colorScheme ?? 'light'].text,
                    },
                  ]}
                  value={formData.expirationDate}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, expirationDate: text }))}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors[colorScheme ?? 'light'].tabIconDefault}
                />
              </View>
            </View>
          </View>

          {/* Additional Info */}
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, { color: Colors[colorScheme ?? 'light'].text }]}>
              Additional Information
            </Text>
            
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: Colors[colorScheme ?? 'light'].text }]}>
                Low Stock Threshold
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: Colors[colorScheme ?? 'light'].card,
                    borderColor: Colors[colorScheme ?? 'light'].border,
                    color: Colors[colorScheme ?? 'light'].text,
                  },
                ]}
                value={formData.lowStockThreshold}
                onChangeText={(text) => setFormData(prev => ({ ...prev, lowStockThreshold: text }))}
                placeholder="1"
                keyboardType="numeric"
                placeholderTextColor={Colors[colorScheme ?? 'light'].tabIconDefault}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: Colors[colorScheme ?? 'light'].text }]}>
                Notes (Optional)
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  styles.textArea,
                  {
                    backgroundColor: Colors[colorScheme ?? 'light'].card,
                    borderColor: Colors[colorScheme ?? 'light'].border,
                    color: Colors[colorScheme ?? 'light'].text,
                  },
                ]}
                value={formData.notes}
                onChangeText={(text) => setFormData(prev => ({ ...prev, notes: text }))}
                placeholder="Add any notes about this item..."
                placeholderTextColor={Colors[colorScheme ?? 'light'].tabIconDefault}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 20,
    textAlign: 'center',
  },
  loadingSubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  photoContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  photoPreview: {
    width: 200,
    height: 200,
    borderRadius: 12,
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: {
    height: 80,
  },
  row: {
    flexDirection: 'row',
  },
  pickerText: {
    fontSize: 16,
  },
  categoryScroll: {
    marginTop: 8,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
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
  locationScroll: {
    marginTop: 8,
  },
  locationButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  locationText: {
    fontSize: 14,
    fontWeight: '500',
  },
  bottomSpacer: {
    height: 40,
  },
});
