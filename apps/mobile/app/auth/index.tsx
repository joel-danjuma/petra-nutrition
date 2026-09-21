import { useState } from 'react';
import { View, Pressable, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Eye, EyeOff } from 'lucide-react-native';
import { useAuth } from '@petra/shared';

import { color, space } from '../../src/theme';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { Text } from '../../src/components/ui/Text';

export default function AuthScreen() {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const handleSubmit = async () => {
    if (!formData.email.trim() || !formData.password.trim()) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (!isLogin) {
      if (!formData.firstName.trim() || !formData.lastName.trim()) {
        Alert.alert('Error', 'Please fill in all required fields');
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        Alert.alert('Error', 'Passwords do not match');
        return;
      }
    }

    setIsLoading(true);

    try {
      if (isLogin) {
        await login({ email: formData.email.trim(), password: formData.password });
      } else {
        await register({
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          email: formData.email.trim(),
          password: formData.password,
          // Required by CreateUser; everyone starts on the free tier.
          subscriptionTier: 'FREE',
        });
      }

      // No navigation here: the root layout's guards register the signed-in
      // stack as soon as the store updates, and navigating to a screen that is
      // still being registered races that.
    } catch (error: any) {
      Alert.alert('Error', error.message || `${isLogin ? 'Login' : 'Registration'} failed`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.content}>
          {/* No logo asset exists in this system, so the brand is set in type
              at weight 500 — the documented stand-in for a wordmark. */}
          <View style={styles.header}>
            <Text preset="displayMd" align="center">
              Petra Nutrition
            </Text>
            <Text preset="bodyMd" align="center">
              Cook with what you already have.
            </Text>
          </View>

          <View style={styles.form}>
            {!isLogin && (
              <View style={styles.nameRow}>
                <Input
                  containerStyle={styles.flex}
                  label="First name"
                  value={formData.firstName}
                  onChangeText={value => handleInputChange('firstName', value)}
                  autoCapitalize="words"
                />
                <Input
                  containerStyle={styles.flex}
                  label="Last name"
                  value={formData.lastName}
                  onChangeText={value => handleInputChange('lastName', value)}
                  autoCapitalize="words"
                />
              </View>
            )}

            <Input
              label="Email"
              value={formData.email}
              onChangeText={value => handleInputChange('email', value)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Input
              label="Password"
              value={formData.password}
              onChangeText={value => handleInputChange('password', value)}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              trailing={
                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {showPassword ? (
                    <EyeOff size={18} color={color.muted} strokeWidth={1.85} />
                  ) : (
                    <Eye size={18} color={color.muted} strokeWidth={1.85} />
                  )}
                </Pressable>
              }
            />

            {!isLogin && (
              <Input
                label="Confirm password"
                value={formData.confirmPassword}
                onChangeText={value => handleInputChange('confirmPassword', value)}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
            )}

            <Button onPress={handleSubmit} loading={isLoading} fullWidth style={styles.submit}>
              {isLogin ? 'Sign in' : 'Create account'}
            </Button>

            <Pressable
              style={styles.switch}
              onPress={() => setIsLogin(!isLogin)}
              disabled={isLoading}
              accessibilityRole="button"
            >
              {/* Inline text link — the one place the link blue is allowed. */}
              <Text preset="bodyMd" color={color.link} align="center">
                {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.canvas },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: space.lg },
  header: { alignItems: 'center', marginBottom: space.xxl, gap: space.xs },
  form: { gap: space.md },
  nameRow: { flexDirection: 'row', gap: space.sm },
  submit: { marginTop: space.xs },
  switch: { alignItems: 'center', marginTop: space.xs },
});
