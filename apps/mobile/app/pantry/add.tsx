import { useState, useEffect, useRef } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { ItemCategory, StorageLocation, toCanonical, usePantry } from '@petra/shared';

import { errorMessage } from '../../src/api/errors';
import { color, radius, space } from '../../src/theme';
import { Chip } from '../../src/components/ui/Chip';
import { Input } from '../../src/components/ui/Input';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { Text } from '../../src/components/ui/Text';

// Canonical enum values, matching the API. These used to be lowercase, which
// the uppercase-only validator rejected — every "Add item" failed with the
// generic "Failed to add item".
const CATEGORIES: { id: ItemCategory; name: string }[] = [
  { id: 'PRODUCE', name: 'Produce' },
  { id: 'DAIRY', name: 'Dairy' },
  { id: 'MEAT', name: 'Meat' },
  { id: 'SEAFOOD', name: 'Seafood' },
  { id: 'GRAINS', name: 'Grains' },
  { id: 'PANTRY_STAPLES', name: 'Pantry' },
  { id: 'SPICES', name: 'Spices' },
  { id: 'CONDIMENTS', name: 'Condiments' },
  { id: 'BEVERAGES', name: 'Beverages' },
  { id: 'FROZEN', name: 'Frozen' },
  { id: 'CANNED', name: 'Canned' },
  { id: 'SNACKS', name: 'Snacks' },
  { id: 'OTHER', name: 'Other' },
];

const LOCATIONS: { id: StorageLocation; name: string }[] = [
  { id: 'PANTRY', name: 'Pantry' },
  { id: 'FRIDGE', name: 'Fridge' },
  { id: 'FREEZER', name: 'Freezer' },
];

const UNITS = [
  'piece', 'lb', 'oz', 'kg', 'g', 'cup', 'tbsp', 'tsp', 'ml', 'l',
  'qt', 'pt', 'gal', 'can', 'box', 'bag', 'bottle', 'jar',
];

export default function AddPantryItemScreen() {
  const { addItem, scanBarcode, recognizeImage } = usePantry();
  const { barcode, photoUri, photoBase64, detected } = useLocalSearchParams<{
    barcode?: string;
    photoUri?: string;
    photoBase64?: string;
    detected?: string;
  }>();
  /** The prefill runs once per arrival, never per render. */
  const prefilled = useRef(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  /** Remaining scanned items waiting their turn through this form. */
  const [queued, setQueued] = useState<{ name: string; category?: string }[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    quantity: '1',
    unit: 'piece',
    category: 'OTHER' as ItemCategory,
    location: 'PANTRY' as StorageLocation,
    brand: '',
    notes: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    expirationDate: '',
    lowStockThreshold: '1',
  });

  // Depends on the individual params, not the params object: expo-router hands
  // back a fresh object every render, so `[params]` never compared equal and
  // this effect re-ran forever — arriving from the scanner pinned the screen on
  // its spinner, with the Save button not even rendered.
  useEffect(() => {
    if (prefilled.current) return;
    if (!barcode && !photoUri && !photoBase64 && !detected) return;
    prefilled.current = true;

    if (barcode) {
      handleBarcodeData(barcode);
    }
    if (photoUri || photoBase64) {
      handleImageData(photoUri as string, photoBase64 as string);
    }
    // Items already reviewed on the scan screen — prefill the first and keep the
    // rest queued, so a multi-item scan doesn't lose everything but the head.
    if (detected) {
      try {
        const items = JSON.parse(detected) as { name: string; category?: string }[];
        if (items.length > 0) {
          setFormData(prev => ({
            ...prev,
            name: items[0].name,
            category: (toCanonical(items[0].category) as ItemCategory) || prev.category,
          }));
          setQueued(items.slice(1));
        }
      } catch {
        // A malformed param shouldn't block manual entry.
      }
    }
  }, [barcode, photoUri, photoBase64, detected]);

  const handleBarcodeData = async (barcode: string) => {
    setIsProcessingImage(true);
    try {
      const result = await scanBarcode(barcode);
      setFormData(prev => ({
        ...prev,
        name: result?.name ?? prev.name,
        brand: result?.brand ?? prev.brand,
        category: (toCanonical(result?.category) as ItemCategory) || prev.category,
      }));
    } catch {
      Alert.alert('Barcode not found', "We couldn't look that up. Please enter details manually.");
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleImageData = async (photoUri: string, photoBase64?: string) => {
    setIsProcessingImage(true);
    try {
      const result = photoBase64 ? await recognizeImage(photoBase64) : null;
      setFormData(prev => ({
        ...prev,
        name: result?.name ?? prev.name,
        category: (toCanonical(result?.category) as ItemCategory) || prev.category,
        location: result ? 'FRIDGE' : prev.location,
      }));
    } catch {
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
      await addItem({
        ...formData,
        quantity: Number(formData.quantity),
        lowStockThreshold: Number(formData.lowStockThreshold),
        purchaseDate: formData.purchaseDate ? new Date(formData.purchaseDate) : new Date(),
        expirationDate: formData.expirationDate ? new Date(formData.expirationDate) : undefined,
        isLowStock: Number(formData.quantity) <= Number(formData.lowStockThreshold),
      });

      if (queued.length > 0) {
        const [next, ...rest] = queued;
        setQueued(rest);
        setFormData(prev => ({
          ...prev,
          name: next.name,
          category: (toCanonical(next.category) as ItemCategory) || 'OTHER',
          quantity: '1',
          brand: '',
          notes: '',
          expirationDate: '',
        }));
        Alert.alert('Added', `Saved. ${rest.length + 1} more from that scan to confirm.`);
        return;
      }

      Alert.alert('Added', 'Item added to your pantry.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      // The real reason, not a generic one. The server rejects a past expiry
      // date and a few other things this form can produce, and the old message
      // hid all of it behind "Failed to add item".
      Alert.alert('Could not add that item', errorMessage(error, 'Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  if (isProcessingImage) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <LoadingSpinner size="large" />
          <Text preset="titleSm" align="center">
            {barcode ? 'Looking up product' : 'Recognising food item'}
          </Text>
          <Text preset="bodyMd" align="center">
            This may take a few seconds.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={22} color={color.ink} strokeWidth={1.85} />
          </Pressable>
          <Text preset="titleSm">
            {queued.length > 0 ? `Add item · ${queued.length + 1} left` : 'Add item'}
          </Text>
          <Pressable onPress={handleSubmit} disabled={isLoading} accessibilityRole="button">
            <Text preset="labelMd" color={color.ink}>
              {isLoading ? 'Saving' : 'Save'}
            </Text>
          </Pressable>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {photoUri && (
            <View style={styles.photoContainer}>
              <Image source={{ uri: photoUri }} style={styles.photoPreview} />
            </View>
          )}

          <View style={styles.section}>
            <SectionHeader title="Basic information" />
            <View style={styles.stack}>
              <Input
                label="Item name"
                value={formData.name}
                onChangeText={text => setFormData(prev => ({ ...prev, name: text }))}
                placeholder="Organic bananas"
              />

              <View style={styles.row}>
                <Input
                  containerStyle={styles.flex}
                  label="Quantity"
                  value={formData.quantity}
                  onChangeText={text => setFormData(prev => ({ ...prev, quantity: text }))}
                  placeholder="1"
                  keyboardType="numeric"
                />
                <View style={styles.flex}>
                  <Text preset="labelMd" color={color.ink} style={styles.unitLabel}>
                    Unit
                  </Text>
                  <Pressable
                    style={styles.picker}
                    accessibilityRole="button"
                    onPress={() =>
                      Alert.alert(
                        'Select unit',
                        '',
                        UNITS.map(unit => ({
                          text: unit,
                          onPress: () => setFormData(prev => ({ ...prev, unit })),
                        }))
                      )
                    }
                  >
                    <Text preset="labelMd" color={color.ink}>
                      {formData.unit}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <Input
                label="Brand"
                hint="Optional"
                value={formData.brand}
                onChangeText={text => setFormData(prev => ({ ...prev, brand: text }))}
                placeholder="Organic Valley"
              />
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeader title="Category" />
            <View style={styles.chipWrap}>
              {CATEGORIES.map(category => (
                <Chip
                  key={category.id}
                  label={category.name}
                  selected={formData.category === category.id}
                  onPress={() => setFormData(prev => ({ ...prev, category: category.id }))}
                />
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeader title="Location" />
            <View style={styles.chipWrap}>
              {LOCATIONS.map(location => (
                <Chip
                  key={location.id}
                  label={location.name}
                  selected={formData.location === location.id}
                  onPress={() => setFormData(prev => ({ ...prev, location: location.id }))}
                />
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeader title="Dates" />
            <View style={styles.row}>
              <Input
                containerStyle={styles.flex}
                label="Purchased"
                value={formData.purchaseDate}
                onChangeText={text => setFormData(prev => ({ ...prev, purchaseDate: text }))}
                placeholder="YYYY-MM-DD"
              />
              <Input
                containerStyle={styles.flex}
                label="Expires"
                value={formData.expirationDate}
                onChangeText={text => setFormData(prev => ({ ...prev, expirationDate: text }))}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeader title="Additional information" />
            <View style={styles.stack}>
              <Input
                label="Low stock threshold"
                value={formData.lowStockThreshold}
                onChangeText={text => setFormData(prev => ({ ...prev, lowStockThreshold: text }))}
                placeholder="1"
                keyboardType="numeric"
              />
              <Input
                label="Notes"
                hint="Optional"
                value={formData.notes}
                onChangeText={text => setFormData(prev => ({ ...prev, notes: text }))}
                placeholder="Anything worth remembering about this item"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                style={styles.textArea}
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
  container: { flex: 1, backgroundColor: color.canvas },
  flex: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.xxl,
    gap: space.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  content: { flex: 1, paddingHorizontal: space.lg },
  photoContainer: { marginVertical: space.lg, alignItems: 'center' },
  photoPreview: { width: 200, height: 200, borderRadius: radius.md },
  section: { marginTop: space.lg },
  stack: { gap: space.md },
  row: { flexDirection: 'row', gap: space.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  unitLabel: { marginBottom: space.xs },
  picker: {
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    justifyContent: 'center',
  },
  textArea: { height: 80 },
  bottomSpacer: { height: space.xxl },
});
