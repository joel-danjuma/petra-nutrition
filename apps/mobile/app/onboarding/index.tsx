import { useState } from 'react';
import { View, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '@petra/shared';

import { color, radius, space } from '../../src/theme';
import { Button } from '../../src/components/ui/Button';
import { Chip } from '../../src/components/ui/Chip';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { Text } from '../../src/components/ui/Text';
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
const HOUSEHOLD_OPTIONS = ['1', '2', '4', '6+'];
const SKILL_OPTIONS: { id: 'beginner' | 'confident' | 'experienced'; label: string }[] = [
  { id: 'beginner', label: 'Just starting out' },
  { id: 'confident', label: 'Getting confident' },
  { id: 'experienced', label: 'I know my way around' },
];

export default function OnboardingScreen() {
  const token = useAuthStore(state => state.token);

  const [step, setStep] = useState(0);
  const [diets, setDiets] = useState<string[]>([]);
  const [household, setHousehold] = useState('2');
  const [skill, setSkill] = useState<'beginner' | 'confident' | 'experienced'>('confident');
  const [isSaving, setIsSaving] = useState(false);

  const toggleDiet = (label: string) => {
    setDiets(prev => (prev.includes(label) ? prev.filter(d => d !== label) : [...prev, label]));
  };

  const finish = async () => {
    setIsSaving(true);
    try {
      await fetch(`${API_URL}/users/onboarding`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dietaryRestrictions: diets,
          allergies: [],
          householdSize: household === '6+' ? 6 : Number(household),
          cookingSkill: skill,
        }),
      });
    } catch {
      // Non-fatal — preferences can be updated later from Profile.
    } finally {
      setIsSaving(false);
      router.replace('/(tabs)');
    }
  };

  const next = () => {
    if (step < 2) setStep(step + 1);
    else finish();
  };

  const cta = ['Get started', "That's me", 'Cook something tonight'][step];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {step === 0 && (
          <View style={styles.step}>
            {/* The opening image. No illustration assets exist in this design
                system, so a signature surface stands in rather than a stock
                photo — it is the system's own way of carrying a hero. */}
            <View style={styles.hero}>
              <Text preset="displayMd" color={color.white} align="center">
                Petra
              </Text>
            </View>
            {/* Display type sits at weight 400 — the size carries it, not bold. */}
            <Text preset="displayMd">Cook with what you already have.</Text>
            <Text preset="bodyMd">
              Tell Petra what&apos;s in the kitchen. She&apos;ll invent the dish, keep you safe at
              the stove, and make sure nothing gets binned.
            </Text>
          </View>
        )}

        {step === 1 && (
          <View style={styles.step}>
            <Text preset="titleLg">What should I never put in front of you?</Text>
            <Text preset="bodyMd">
              Tap anything that applies. You can be more specific later.
            </Text>
            <View style={styles.chipWrap}>
              {DIET_OPTIONS.map(label => (
                <Chip
                  key={label}
                  label={label}
                  selected={diets.includes(label)}
                  onPress={() => toggleDiet(label)}
                />
              ))}
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.step}>
            <Text preset="titleLg">Who&apos;s at the table, and how confident are you?</Text>

            <View style={styles.group}>
              <SectionHeader title="Portions" />
              <View style={styles.row}>
                {HOUSEHOLD_OPTIONS.map(h => {
                  const on = household === h;
                  return (
                    <Pressable
                      key={h}
                      onPress={() => setHousehold(h)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={[styles.optionBox, on ? styles.optionOn : styles.optionOff]}
                    >
                      <Text preset="labelMd" color={on ? color.white : color.ink}>
                        {h}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.group}>
              <SectionHeader title="In the kitchen I'm" />
              <View style={styles.stack}>
                {SKILL_OPTIONS.map(opt => {
                  const on = skill === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => setSkill(opt.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={[styles.skillOption, on ? styles.optionOn : styles.optionOff]}
                    >
                      <Text preset="labelMd" color={on ? color.white : color.ink}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Text preset="caption">
              Beginners get more technique detail and every safety check spelled out. Confident
              cooks get the short version.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step > 0 && (
          <Pressable
            onPress={() => setStep(step - 1)}
            accessibilityRole="button"
            style={styles.back}
          >
            <Text preset="caption" color={color.muted}>
              Back
            </Text>
          </Pressable>
        )}
        <View style={styles.dots}>
          {[0, 1, 2].map(i => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  width: i === step ? 22 : 6,
                  backgroundColor: i === step ? color.ink : color.surfaceStrong,
                },
              ]}
            />
          ))}
        </View>
        <Button onPress={next} loading={isSaving} fullWidth>
          {cta}
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.canvas },
  content: { flexGrow: 1, padding: space.lg, paddingTop: space.xxl },
  step: { gap: space.md },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs },
  group: { marginTop: space.xs },
  stack: { gap: space.xs },
  row: { flexDirection: 'row', gap: space.xs },
  optionBox: {
    flex: 1,
    paddingVertical: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
  },
  skillOption: {
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  optionOn: { backgroundColor: color.ink, borderColor: color.ink },
  optionOff: { backgroundColor: color.canvas, borderColor: color.hairline },
  hero: {
    height: 200,
    borderRadius: radius.lg,
    backgroundColor: color.forest,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  back: { alignSelf: 'flex-start', paddingVertical: space.xs },
  footer: { padding: space.lg, paddingTop: space.sm, gap: space.sm },
  dots: { flexDirection: 'row', gap: space.xxs, justifyContent: 'center' },
  dot: { height: 6, borderRadius: radius.xs },
});
