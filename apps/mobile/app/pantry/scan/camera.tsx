import { useState, useRef } from 'react';
import { View, StyleSheet, Pressable, Alert, Dimensions, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Check, Images, PenLine, X, Zap, ZapOff } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@petra/shared';

import { color, onDark, radius, space } from '../../../src/theme';
import { CameraPermissionGate } from '../../../src/components/CameraPermissionGate';
import { LoadingSpinner } from '../../../src/components/ui/LoadingSpinner';
import { Text } from '../../../src/components/ui/Text';
import { API_URL } from '../../../src/config/api';

const { width } = Dimensions.get('window');

/**
 * The single scan screen: barcode, fresh food, and receipt in one place.
 *
 * Previously `/pantry/scan/barcode` existed as a separate route that nothing in
 * the app linked to, so barcode scanning was unreachable. Folding the modes into
 * one screen matches the mockup and makes all three reachable.
 */
type ScanMode = 'barcode' | 'fresh' | 'receipt';

const MODES: { id: ScanMode; label: string }[] = [
  { id: 'barcode', label: 'Barcode' },
  { id: 'fresh', label: 'Fresh food' },
  { id: 'receipt', label: 'Receipt' },
];

interface DetectedItem {
  name: string;
  category?: string;
  /** 0–1, when the recogniser reports one. */
  confidence?: number;
  meta?: string;
  selected: boolean;
}

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const token = useAuthStore(state => state.token);
  const [mode, setMode] = useState<ScanMode>('fresh');
  const [isProcessing, setIsProcessing] = useState(false);
  const [flashMode, setFlashMode] = useState<'off' | 'on'>('off');
  const [detected, setDetected] = useState<DetectedItem[] | null>(null);
  const [scanLocked, setScanLocked] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const switchMode = (next: ScanMode) => {
    setMode(next);
    setDetected(null);
    setScanLocked(false);
    Haptics.selectionAsync();
  };

  /** Barcode mode resolves to a single known product, so it skips the review list. */
  const handleBarcode = ({ data }: { data: string }) => {
    if (scanLocked || isProcessing) return;
    setScanLocked(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace({ pathname: '/pantry/add', params: { barcode: data } });
  };

  const capture = async () => {
    if (!cameraRef.current || isProcessing) return;

    try {
      setIsProcessing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
        skipProcessing: false,
      });
      if (!photo) return;

      // Recognition happens here rather than on the add screen so several items
      // can be reviewed before any of them is committed to the pantry.
      const res = await fetch(`${API_URL}/pantry/scan/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: photo.base64,
          context: mode === 'receipt' ? 'receipt' : 'pantry_item',
        }),
      });
      const data = await res.json();

      const items: DetectedItem[] = (
        Array.isArray(data?.data) ? data.data : data?.data ? [data.data] : []
      )
        .filter((i: any) => i?.name)
        .map((i: any) => ({
          name: i.name,
          category: i.category,
          confidence: i.confidence,
          meta: [i.category, i.confidence ? `${Math.round(i.confidence * 100)}%` : null]
            .filter(Boolean)
            .join(' · '),
          selected: true,
        }));

      if (items.length === 0) {
        // Recognition is unavailable without a Google AI key. Say so plainly and
        // hand over to manual entry rather than pretending it half-worked.
        Alert.alert(
          "Couldn't read that",
          'Add the item manually and Petra will remember it.',
          [
            { text: 'Try again', style: 'cancel' },
            {
              text: 'Add manually',
              onPress: () => router.replace({ pathname: '/pantry/add', params: { photoUri: photo.uri } }),
            },
          ]
        );
        return;
      }

      setDetected(items);
    } catch {
      Alert.alert('Camera error', 'Failed to capture. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleDetected = (index: number) =>
    setDetected(prev =>
      prev ? prev.map((d, i) => (i === index ? { ...d, selected: !d.selected } : d)) : prev
    );

  const addSelected = async () => {
    const chosen = detected?.filter(d => d.selected) ?? [];
    if (chosen.length === 0) return;

    // One at a time through the existing endpoint; the first is handed to the
    // add screen so quantities and dates can be confirmed.
    router.replace({
      pathname: '/pantry/add',
      params: { detected: JSON.stringify(chosen.map(c => ({ name: c.name, category: c.category }))) },
    });
  };

  const selectedCount = detected?.filter(d => d.selected).length ?? 0;

  return (
    <CameraPermissionGate
      permission={permission}
      requestPermission={requestPermission}
      reason="Petra uses the camera to read barcodes, recognise food and scan receipts straight into your pantry."
    >
      <SafeAreaView style={styles.container}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          flash={flashMode}
          onBarcodeScanned={mode === 'barcode' && !scanLocked ? handleBarcode : undefined}
          barcodeScannerSettings={{
            barcodeTypes: ['upc_a', 'upc_e', 'ean13', 'ean8', 'code128', 'code39'],
          }}
        >
          <View style={styles.header}>
            <Pressable
              style={styles.headerButton}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Close scanner"
            >
              <X size={22} color={color.white} strokeWidth={1.85} />
            </Pressable>
            <Text preset="titleSm" color={color.white}>
              Fill the pantry
            </Text>
            <Pressable
              style={styles.headerButton}
              onPress={() => setFlashMode(f => (f === 'off' ? 'on' : 'off'))}
              accessibilityRole="button"
              accessibilityLabel={flashMode === 'on' ? 'Turn flash off' : 'Turn flash on'}
            >
              {flashMode === 'on' ? (
                <Zap size={22} color={color.white} strokeWidth={1.85} />
              ) : (
                <ZapOff size={22} color={color.white} strokeWidth={1.85} />
              )}
            </Pressable>
          </View>

          {/* Viewfinder — a narrow letterbox for barcodes, a square for food. */}
          <View style={styles.overlay}>
            <View style={mode === 'barcode' ? styles.frameBarcode : styles.frameSquare}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
              {isProcessing && (
                <View style={styles.processingOverlay}>
                  <LoadingSpinner size="large" color={color.white} />
                  <Text preset="bodyMd" color={color.white}>
                    Reading
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Mode selector */}
          <View style={styles.modeRow}>
            {MODES.map(m => {
              const on = m.id === mode;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => switchMode(m.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.modeChip, on ? styles.modeChipOn : styles.modeChipOff]}
                >
                  <Text preset="caption" color={on ? color.ink : color.white}>
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {detected ? (
            /* Review panel — nothing reaches the pantry until it's confirmed. */
            <View style={styles.results}>
              <View style={styles.resultsHeader}>
                <Text preset="titleSm" color={color.white}>
                  Found {detected.length} item{detected.length === 1 ? '' : 's'}
                </Text>
                <Text preset="caption" color={onDark.textMuted}>
                  Expiry estimated
                </Text>
              </View>

              <ScrollView style={styles.resultsList}>
                {detected.map((item, i) => (
                  <Pressable
                    key={`${item.name}-${i}`}
                    style={styles.resultRow}
                    onPress={() => toggleDetected(i)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: item.selected }}
                  >
                    <View style={[styles.checkbox, item.selected && styles.checkboxOn]}>
                      {item.selected && <Check size={13} color={color.ink} strokeWidth={2.4} />}
                    </View>
                    <View style={styles.flex}>
                      <Text preset="labelMd" color={color.white}>
                        {item.name}
                      </Text>
                      {item.meta ? (
                        <Text preset="caption" color={onDark.textMuted}>
                          {item.meta}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </ScrollView>

              <Pressable
                style={[styles.addButton, selectedCount === 0 && styles.addButtonDisabled]}
                onPress={addSelected}
                disabled={selectedCount === 0}
                accessibilityRole="button"
              >
                <Text preset="labelMd" color={color.ink}>
                  Add {selectedCount} to pantry
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.bottomControls}>
              <Pressable
                style={styles.sideButton}
                accessibilityRole="button"
                accessibilityLabel="Choose from gallery"
                onPress={() => router.replace('/pantry/add')}
              >
                <Images size={22} color={color.white} strokeWidth={1.85} />
              </Pressable>

              {mode === 'barcode' ? (
                <View style={styles.barcodeHint}>
                  <Text preset="bodyMd" color={color.white} align="center">
                    Line the barcode up in the frame
                  </Text>
                </View>
              ) : (
                <Pressable
                  style={[styles.captureButton, isProcessing && styles.captureDisabled]}
                  onPress={capture}
                  disabled={isProcessing}
                  accessibilityRole="button"
                  accessibilityLabel="Capture"
                >
                  <View style={styles.captureInner} />
                </Pressable>
              )}

              <Pressable
                style={styles.sideButton}
                onPress={() => router.replace('/pantry/add')}
                accessibilityRole="button"
                accessibilityLabel="Add manually"
              >
                <PenLine size={22} color={color.white} strokeWidth={1.85} />
              </Pressable>
            </View>
          )}
        </CameraView>
      </SafeAreaView>
    </CameraPermissionGate>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.surfaceDark },
  flex: { flex: 1 },
  camera: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  headerButton: {
    width: space.xxl - space.xs,
    height: space.xxl - space.xs,
    borderRadius: radius.full,
    backgroundColor: onDark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  frameSquare: { width: width * 0.78, height: width * 0.78, position: 'relative' },
  frameBarcode: { width: width * 0.78, height: width * 0.4, position: 'relative' },
  corner: {
    position: 'absolute',
    width: space.xl,
    height: space.xl,
    borderColor: color.white,
  },
  topLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  topRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  processingOverlay: {
    // absoluteFillObject was dropped from React Native's types in 0.86;
    // absoluteFill is the same frozen object and is still public.
    ...StyleSheet.absoluteFill,
    backgroundColor: color.surfaceDark,
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.sm,
  },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  modeChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  modeChipOn: { backgroundColor: color.white, borderColor: color.white },
  modeChipOff: { backgroundColor: 'transparent', borderColor: onDark.hairline },
  results: {
    margin: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: onDark.surface,
    gap: space.sm,
    maxHeight: 300,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  resultsList: { maxHeight: 160 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
  },
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
  addButton: {
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    backgroundColor: color.white,
    alignItems: 'center',
  },
  addButtonDisabled: { opacity: 0.4 },
  bottomControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingBottom: space.xl,
  },
  sideButton: {
    width: space.xxl,
    height: space.xxl,
    borderRadius: radius.full,
    backgroundColor: onDark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButton: {
    width: 76,
    height: 76,
    borderRadius: radius.full,
    backgroundColor: color.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureDisabled: { opacity: 0.5 },
  captureInner: {
    width: 62,
    height: 62,
    borderRadius: radius.full,
    backgroundColor: color.white,
    borderWidth: 2,
    borderColor: color.hairline,
  },
  barcodeHint: { flex: 1, paddingHorizontal: space.md },
});
