import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useAuthStore } from '@petra/shared';
import { Colors } from '../../src/constants/Colors';
import { useColorScheme } from '../../src/hooks/useColorScheme';

interface MealPlan {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  days: number;
  createdAt: string;
}

const getApiUrl = () =>
  Platform.OS === 'android' ? 'http://10.0.2.2:3001/api' : 'http://localhost:3001/api';

export default function MealPlansScreen() {
  const colorScheme = useColorScheme();
  const token = useAuthStore(state => state.token);
  const colors = Colors[colorScheme ?? 'light'];
  const API_URL = getApiUrl();

  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [days, setDays] = useState('3');
  const [preferences, setPreferences] = useState('');

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/meal-plans`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setPlans(data.data?.plans || data.data || []);
    } catch {
      Alert.alert('Error', 'Failed to load meal plans.');
    } finally {
      setIsLoading(false);
    }
  };

  const generatePlan = async () => {
    const numDays = parseInt(days, 10);
    if (isNaN(numDays) || numDays < 1 || numDays > 14) {
      Alert.alert('Invalid Input', 'Please enter between 1 and 14 days.');
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
        fetchPlans();
        Alert.alert('Success', 'Meal plan generated!');
      } else {
        throw new Error(data.error?.message || 'Generation failed');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to generate meal plan.');
    } finally {
      setIsGenerating(false);
    }
  };

  const deletePlan = (id: string) => {
    Alert.alert('Delete Plan', 'Are you sure you want to delete this meal plan?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await fetch(`${API_URL}/meal-plans/${id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
            setPlans(prev => prev.filter(p => p.id !== id));
          } catch {
            Alert.alert('Error', 'Failed to delete meal plan.');
          }
        },
      },
    ]);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderPlan = ({ item }: { item: MealPlan }) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardTop}>
        <View style={[styles.daysCircle, { backgroundColor: colors.tint + '20' }]}>
          <Text style={[styles.daysNumber, { color: colors.tint }]}>{item.days}</Text>
          <Text style={[styles.daysLabel, { color: colors.tint }]}>days</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.cardDate, { color: colors.tabIconDefault }]}>
            {formatDate(item.startDate)} — {formatDate(item.endDate)}
          </Text>
          <Text style={[styles.cardCreated, { color: colors.tabIconDefault }]}>
            Created {formatDate(item.createdAt)}
          </Text>
        </View>
        <TouchableOpacity onPress={() => deletePlan(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={20} color={colors.destructive} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Meal Plans</Text>
        <TouchableOpacity
          style={[styles.generateBtn, { backgroundColor: colors.tint }]}
          onPress={() => setShowGenerateModal(true)}
        >
          <Ionicons name="sparkles-outline" size={16} color="white" />
          <Text style={styles.generateBtnText}>Generate</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : plans.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="calendar-outline" size={64} color={colors.tabIconDefault} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Meal Plans</Text>
          <Text style={[styles.emptyDesc, { color: colors.tabIconDefault }]}>
            Generate an AI-powered meal plan to get started
          </Text>
          <TouchableOpacity
            style={[styles.ctaButton, { backgroundColor: colors.tint }]}
            onPress={() => setShowGenerateModal(true)}
          >
            <Ionicons name="sparkles-outline" size={16} color="white" />
            <Text style={styles.ctaButtonText}>Generate Plan</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={plans}
          renderItem={renderPlan}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onRefresh={fetchPlans}
          refreshing={isLoading}
        />
      )}

      <Modal visible={showGenerateModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowGenerateModal(false)}>
              <Text style={[styles.modalCancel, { color: colors.tabIconDefault }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Generate Meal Plan</Text>
            <TouchableOpacity onPress={generatePlan} disabled={isGenerating}>
              {isGenerating ? (
                <ActivityIndicator size="small" color={colors.tint} />
              ) : (
                <Text style={[styles.modalDone, { color: colors.tint }]}>Generate</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Number of Days</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
              value={days}
              onChangeText={setDays}
              keyboardType="number-pad"
              placeholder="1-14"
              placeholderTextColor={colors.tabIconDefault}
              maxLength={2}
            />
            <Text style={[styles.fieldHint, { color: colors.tabIconDefault }]}>
              Free plan: 1 day. Premium: up to 14 days.
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.text }]}>Dietary Preferences</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputMulti, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
              value={preferences}
              onChangeText={setPreferences}
              placeholder="E.g. vegetarian, low-carb, no shellfish..."
              placeholderTextColor={colors.tabIconDefault}
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
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  generateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  generateBtnText: { color: 'white', fontWeight: '600', fontSize: 14 },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  daysCircle: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  daysNumber: { fontSize: 20, fontWeight: '700', lineHeight: 22 },
  daysLabel: { fontSize: 11, fontWeight: '500' },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 3 },
  cardDate: { fontSize: 13, marginBottom: 2 },
  cardCreated: { fontSize: 12 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  emptyDesc: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  ctaButton: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  ctaButtonText: { color: 'white', fontWeight: '600', fontSize: 15 },
  modal: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 14 },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  modalCancel: { fontSize: 16 },
  modalDone: { fontSize: 16, fontWeight: '600' },
  modalBody: { flex: 1 },
  modalBodyContent: { padding: 20 },
  fieldLabel: { fontSize: 15, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  fieldInputMulti: { height: 100, paddingTop: 12 },
  fieldHint: { fontSize: 13, marginTop: 6 },
});
