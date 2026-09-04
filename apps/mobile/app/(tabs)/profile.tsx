import { useState, useEffect, useCallback } from 'react';
import { View, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogOut } from 'lucide-react-native';
import { router } from 'expo-router';
import { useAuth, useAuthStore } from '@petra/shared';

import { color, radius, semantic, space } from '../../src/theme';
import { Button } from '../../src/components/ui/Button';
import { Card, onSurface } from '../../src/components/ui/Card';
import { Chip } from '../../src/components/ui/Chip';
import { ListRow } from '../../src/components/ui/ListRow';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { Text } from '../../src/components/ui/Text';
import { Callout } from '../../src/components/ui/Callout';
import { API_URL } from '../../src/config/api';

const DIET_OPTIONS = [
  'Vegetarian',
  'Pescatarian',
  'Gluten-free',
  'Dairy-free',
  'No pork',
  'No shellfish',
  'Low sodium',
  'Nut allergy',
];

const ALLERGY_OPTIONS = [
  'Shellfish', 'Fish', 'Nuts', 'Peanuts', 'Dairy', 'Gluten', 'Egg', 'Soy', 'Sesame',
];

interface Profile {
  dietaryRestrictions?: string[];
  allergies?: string[];
  dailyCalorieTarget?: number;
  dailyProteinTarget?: number;
  dailyFiberTarget?: number;
  dailySodiumTarget?: number;
}

interface WasteSummary {
  totalKgSaved: number;
  totalValueSaved: number;
  itemsSaved: number;
  weakSpotCategory: string | null;
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const token = useAuthStore(state => state.token);

  const [profile, setProfile] = useState<Profile>({});
  const [waste, setWaste] = useState<WasteSummary | null>(null);
  const [subscriptionTier, setSubscriptionTier] = useState('FREE');
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [profileRes, subRes, wasteRes] = await Promise.all([
        fetch(`${API_URL}/users/profile`, { headers }),
        fetch(`${API_URL}/subscription/status`, { headers }),
        fetch(`${API_URL}/analytics/waste-summary`, { headers }),
      ]);
      const [profileData, subData, wasteData] = await Promise.all([
        profileRes.json(),
        subRes.json(),
        wasteRes.json(),
      ]);
      if (profileData.success) setProfile(profileData.data?.profile || {});
      if (subData.success) setSubscriptionTier(subData.data?.tier || 'FREE');
      if (wasteData.success) setWaste(wasteData.data);
    } catch {
      // non-fatal
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleField = async (field: 'dietaryRestrictions' | 'allergies', label: string) => {
    const current = profile[field] ?? [];
    const next = current.includes(label)
      ? current.filter(d => d !== label)
      : [...current, label];
    setProfile(prev => ({ ...prev, [field]: next }));
    try {
      await fetch(`${API_URL}/users/profile`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: { [field]: next } }),
      });
    } catch {
      Alert.alert('Error', 'Failed to update preference.');
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);
  };

  const handleUpgrade = async () => {
    Alert.alert(
      'Upgrade to Premium',
      'Full-week plans, pantry tracking, camera logging, and smarter shopping lists.',
      [
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
                Alert.alert('Welcome to Premium', 'Your account has been upgraded.');
              }
            } catch {
              Alert.alert('Error', 'Failed to upgrade. Please try again.');
            }
          },
        },
      ]
    );
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

  const targets = [
    { label: 'Calories', val: `${profile.dailyCalorieTarget ?? 2150} kcal` },
    { label: 'Protein', val: `${profile.dailyProteinTarget ?? 140} g` },
    { label: 'Fibre', val: `${profile.dailyFiberTarget ?? 30} g` },
    { label: 'Sodium', val: `Under ${profile.dailySodiumTarget ?? 2000} mg` },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text preset="titleMd" color={color.ink}>
              {(user?.firstName?.[0] || '?').toUpperCase()}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text preset="titleMd">
              {user?.firstName} {user?.lastName}
            </Text>
            <Text preset="caption">
              {subscriptionTier === 'PREMIUM'
                ? 'Premium'
                : 'Free plan · pantry and week plans locked'}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          {/* Waste avoided is the app's proudest number, so it earns a
              full-bleed forest signature surface rather than a green tint. */}
          {waste && (
            <Card surface="forest">
              <Text preset="caption" color={onSurface.forest} style={styles.eyebrow}>
                WASTE AVOIDED
              </Text>
              <View style={styles.wasteValueRow}>
                <Text preset="displayMd" color={onSurface.forest}>
                  {waste.totalKgSaved} kg
                </Text>
                {waste.totalValueSaved > 0 && (
                  <Text preset="bodyMd" color={onSurface.forest}>
                    ≈ £{waste.totalValueSaved.toFixed(0)}
                  </Text>
                )}
              </View>
              <Text preset="bodyMd" color={onSurface.forest} style={styles.wasteDesc}>
                {waste.itemsSaved > 0
                  ? `You've cooked ${waste.itemsSaved} items before they turned.${
                      waste.weakSpotCategory
                        ? ` Your weak spot is ${waste.weakSpotCategory
                            .toLowerCase()
                            .replace('_', ' ')}.`
                        : ''
                    }`
                  : 'Finish a cook-mode recipe or log a used item to start tracking.'}
              </Text>
            </Card>
          )}

          <View>
            <SectionHeader title="Diet" />
            <View style={styles.chipWrap}>
              {DIET_OPTIONS.map(label => (
                <Chip
                  key={label}
                  label={label}
                  selected={(profile.dietaryRestrictions ?? []).includes(label)}
                  onPress={() => toggleField('dietaryRestrictions', label)}
                />
              ))}
            </View>
          </View>

          {/* Allergies are their own control, not a diet preference — the
              retrieval layer treats them as a hard block rather than a nudge. */}
          <View>
            <SectionHeader title="Allergies" />
            <View style={styles.chipWrap}>
              {ALLERGY_OPTIONS.map(label => (
                <Chip
                  key={label}
                  label={label}
                  selected={(profile.allergies ?? []).includes(label)}
                  onPress={() => toggleField('allergies', label)}
                />
              ))}
            </View>
            {(profile.allergies ?? []).length > 0 && (
              <View style={styles.allergyNote}>
                <Callout tone="allergy" title={`Severe: ${(profile.allergies ?? []).join(', ')}`}>
                  Petra blocks these recipes outright and flags shared-equipment risk. Ingredient
                  names are matched automatically, so check the label yourself before you cook.
                </Callout>
              </View>
            )}
          </View>

          <View>
            <SectionHeader title="Daily targets" />
            <Card padded={false}>
              {targets.map((t, i) => (
                <ListRow
                  key={t.label}
                  title={t.label}
                  value={t.val}
                  last={i === targets.length - 1}
                />
              ))}
            </Card>
          </View>

          {/* Pricing is a documented sub-system: Inter type and a pill CTA,
              which appear nowhere else in the app. */}
          {subscriptionTier !== 'PREMIUM' && (
            <Card surface="soft">
              <Text preset="pricingCardTitle">Petra Premium</Text>
              <Text preset="bodyMd" style={styles.premiumDesc}>
                Full-week plans, pantry inventory with expiry tracking, camera logging, and
                shopping lists that skip what you already own.
              </Text>
              <Button variant="pill" onPress={handleUpgrade} fullWidth>
                £4.99 / month
              </Button>
            </Card>
          )}

          <Button variant="secondary" onPress={() => router.push('/onboarding')} fullWidth>
            Replay the setup flow
          </Button>

          <Pressable
            style={styles.signOut}
            onPress={handleLogout}
            accessibilityRole="button"
          >
            <LogOut size={20} color={semantic.danger} strokeWidth={1.85} />
            <Text preset="labelMd" color={semantic.danger}>
              Sign out
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.canvas },
  flex: { flex: 1, gap: space.xxs },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
    paddingBottom: space.md,
  },
  avatar: {
    width: space.xxl,
    height: space.xxl,
    borderRadius: radius.full,
    backgroundColor: color.surfaceStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: { padding: space.lg, gap: space.lg },
  eyebrow: { letterSpacing: 1.2 },
  wasteValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.xs,
    marginTop: space.xs,
  },
  wasteDesc: { marginTop: space.xs },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  allergyNote: { marginTop: space.sm },
  premiumDesc: { marginVertical: space.sm },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.md,
  },
});
