import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Switch,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useAuth, useAuthStore } from '@petra/shared';
import { Colors } from '../../src/constants/Colors';
import { useColorScheme } from '../../src/hooks/useColorScheme';

const getApiUrl = () =>
  Platform.OS === 'android' ? 'http://10.0.2.2:3001/api' : 'http://localhost:3001/api';

interface Profile {
  bio?: string;
  age?: number;
  height?: number;
  weight?: number;
  activityLevel?: string;
  healthGoal?: string;
  dietaryRestrictions?: string[];
}

interface UserStats {
  totalRecipes: number;
  totalFavorites: number;
  totalMealPlans: number;
  totalPantryItems: number;
}

const DIETARY_OPTIONS = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Halal', 'Kosher', 'Nut-Free'];
const HEALTH_GOALS = ['WEIGHT_LOSS', 'MUSCLE_GAIN', 'MAINTENANCE', 'GENERAL_HEALTH'];
const HEALTH_GOAL_LABELS: Record<string, string> = {
  WEIGHT_LOSS: 'Weight Loss',
  MUSCLE_GAIN: 'Muscle Gain',
  MAINTENANCE: 'Maintenance',
  GENERAL_HEALTH: 'General Health',
};

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { user, logout } = useAuth();
  const token = useAuthStore(state => state.token);
  const API_URL = getApiUrl();

  const [profile, setProfile] = useState<Profile>({});
  const [stats, setStats] = useState<UserStats | null>(null);
  const [subscriptionTier, setSubscriptionTier] = useState('FREE');
  const [isLoading, setIsLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setIsLoading(true);
    try {
      const [profileRes, statsRes, subRes] = await Promise.all([
        fetch(`${API_URL}/users/profile`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/users/stats`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/subscription/status`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const [profileData, statsData, subData] = await Promise.all([
        profileRes.json(),
        statsRes.json(),
        subRes.json(),
      ]);

      if (profileData.success) setProfile(profileData.data?.profile || {});
      if (statsData.success) setStats(statsData.data);
      if (subData.success) setSubscriptionTier(subData.data?.tier || 'FREE');
    } catch {
      // non-fatal
    } finally {
      setIsLoading(false);
    }
  };

  const saveProfile = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`${API_URL}/users/profile`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName }),
      });
      const data = await res.json();
      if (data.success) {
        setShowEditModal(false);
        Alert.alert('Success', 'Profile updated.');
      } else {
        throw new Error(data.error?.message || 'Update failed');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const handleUpgrade = async () => {
    Alert.alert('Upgrade to Premium', 'Unlock pantry tracking, multi-day meal plans, and smart shopping lists for $9/month.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Upgrade',
        onPress: async () => {
          try {
            const res = await fetch(`${API_URL}/subscription/upgrade`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) {
              setSubscriptionTier('PREMIUM');
              Alert.alert('Welcome to Premium!', 'Your account has been upgraded.');
            }
          } catch {
            Alert.alert('Error', 'Failed to upgrade. Please try again.');
          }
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Profile</Text>
          <TouchableOpacity onPress={() => { setFirstName(user?.firstName || ''); setLastName(user?.lastName || ''); setShowEditModal(true); }}>
            <Ionicons name="pencil-outline" size={22} color={colors.tint} />
          </TouchableOpacity>
        </View>

        {/* User Info */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.tint }]}>
            <Text style={styles.avatarText}>
              {(user?.firstName?.[0] || '?').toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.userName, { color: colors.text }]}>
            {user?.firstName} {user?.lastName}
          </Text>
          <Text style={[styles.userEmail, { color: colors.tabIconDefault }]}>{user?.email}</Text>

          <View style={[styles.tierBadge, {
            backgroundColor: subscriptionTier === 'PREMIUM' ? colors.tint + '20' : colors.muted,
          }]}>
            {subscriptionTier === 'PREMIUM' && (
              <Ionicons name="star" size={14} color={colors.tint} style={{ marginRight: 4 }} />
            )}
            <Text style={[styles.tierText, { color: subscriptionTier === 'PREMIUM' ? colors.tint : colors.tabIconDefault }]}>
              {subscriptionTier === 'PREMIUM' ? 'Premium' : 'Free Plan'}
            </Text>
          </View>
        </View>

        {/* Stats */}
        {stats && (
          <View style={styles.statsRow}>
            {[
              { label: 'Recipes', value: stats.totalRecipes },
              { label: 'Favorites', value: stats.totalFavorites },
              { label: 'Meal Plans', value: stats.totalMealPlans },
              { label: 'Pantry', value: stats.totalPantryItems },
            ].map(stat => (
              <View key={stat.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.statValue, { color: colors.text }]}>{stat.value}</Text>
                <Text style={[styles.statLabel, { color: colors.tabIconDefault }]}>{stat.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Subscription */}
        {subscriptionTier !== 'PREMIUM' && (
          <View style={[styles.upgradeCard, { backgroundColor: colors.tint + '10', borderColor: colors.tint + '30' }]}>
            <View style={styles.upgradeContent}>
              <Ionicons name="star-outline" size={24} color={colors.tint} />
              <View style={styles.upgradeText}>
                <Text style={[styles.upgradeTitle, { color: colors.text }]}>Upgrade to Premium</Text>
                <Text style={[styles.upgradeDesc, { color: colors.tabIconDefault }]}>
                  Pantry, multi-day meal plans, shopping lists — $9/mo
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.upgradeButton, { backgroundColor: colors.tint }]}
              onPress={handleUpgrade}
            >
              <Text style={styles.upgradeButtonText}>Upgrade</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Account Actions */}
        <View style={[styles.menuSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.menuSectionTitle, { color: colors.tabIconDefault }]}>Account</Text>

          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: colors.border }]}>
            <Ionicons name="notifications-outline" size={22} color={colors.text} style={styles.menuIcon} />
            <Text style={[styles.menuLabel, { color: colors.text }]}>Notifications</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.tabIconDefault} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: colors.border }]}>
            <Ionicons name="shield-checkmark-outline" size={22} color={colors.text} style={styles.menuIcon} />
            <Text style={[styles.menuLabel, { color: colors.text }]}>Privacy</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.tabIconDefault} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: 'transparent' }]} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={22} color={colors.destructive} style={styles.menuIcon} />
            <Text style={[styles.menuLabel, { color: colors.destructive }]}>Sign Out</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.tabIconDefault} />
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.tabIconDefault }]}>Petra AI v1.0.0</Text>
        </View>
      </ScrollView>

      {/* Edit Name Modal */}
      <Modal visible={showEditModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowEditModal(false)}>
              <Text style={[styles.modalCancel, { color: colors.tabIconDefault }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Profile</Text>
            <TouchableOpacity onPress={saveProfile} disabled={isSaving}>
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.tint} />
              ) : (
                <Text style={[styles.modalDone, { color: colors.tint }]}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>First Name</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First name"
              placeholderTextColor={colors.tabIconDefault}
            />
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Last Name</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last name"
              placeholderTextColor={colors.tabIconDefault}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  section: { margin: 16, borderRadius: 16, borderWidth: 1, padding: 20, alignItems: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { color: 'white', fontSize: 28, fontWeight: '700' },
  userName: { fontSize: 20, fontWeight: '600', marginBottom: 4 },
  userEmail: { fontSize: 14, marginBottom: 12 },
  tierBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  tierText: { fontSize: 13, fontWeight: '600' },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  statCard: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 11, marginTop: 2 },
  upgradeCard: { marginHorizontal: 16, marginBottom: 8, borderRadius: 16, borderWidth: 1, padding: 16 },
  upgradeContent: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  upgradeText: { flex: 1 },
  upgradeTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  upgradeDesc: { fontSize: 13 },
  upgradeButton: { borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  upgradeButtonText: { color: 'white', fontWeight: '600', fontSize: 15 },
  menuSection: { marginHorizontal: 16, marginTop: 8, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  menuSectionTitle: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  menuIcon: { marginRight: 12 },
  menuLabel: { flex: 1, fontSize: 16 },
  footer: { alignItems: 'center', padding: 24 },
  footerText: { fontSize: 13 },
  modal: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 14 },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  modalCancel: { fontSize: 16 },
  modalDone: { fontSize: 16, fontWeight: '600' },
  modalBody: { flex: 1 },
  modalBodyContent: { padding: 20 },
  fieldLabel: { fontSize: 15, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
});
