import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { color, radius, shadow, space, type } from '../../theme';

/**
 * The Petra Nutrition button.
 *
 * Mirrors the design system's `components/buttons/Button.jsx` contract. The
 * signature pair is `primary` (near-black CTA) + `secondary` (white, hairline
 * outline). `pill` and `legal` are sub-system dialects — `pill` must never
 * appear outside pricing surfaces, and `primary` is never recoloured.
 *
 * There is no hover state by design: the system documents default and
 * active/pressed only.
 */

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'secondary-on-dark'
  | 'pill'
  | 'legal';

export interface ButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function Button({
  onPress,
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  leftIcon,
  rightIcon,
  disabled = false,
  loading = false,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const surface = (pressed: boolean): ViewStyle => {
    if (isDisabled) {
      return variant === 'primary'
        ? { backgroundColor: color.borderStrong }
        : {
            backgroundColor: color.canvas,
            borderWidth: 1,
            borderColor: color.borderStrong,
          };
    }
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: pressed ? color.primaryActive : color.ink,
          ...shadow.buttonRest,
        };
      case 'legal':
        return { backgroundColor: pressed ? color.linkActive : color.link };
      // `secondary`, `secondary-on-dark` and `pill` are all the white,
      // hairline-outlined surface — the on-dark variant stays white rather
      // than inverting, which the system never does.
      default:
        return {
          backgroundColor: pressed ? color.surfaceSoft : color.canvas,
          borderWidth: 1,
          borderColor: color.hairline,
        };
    }
  };

  const label = (): { color: string } => {
    if (isDisabled) {
      return { color: variant === 'primary' ? color.white : color.borderStrong };
    }
    if (variant === 'primary' || variant === 'legal') return { color: color.white };
    if (variant === 'pill') return { color: color.pricingInk };
    return { color: color.ink };
  };

  const textStyle =
    variant === 'pill'
      ? type.pricingCardTitle
      : variant === 'legal'
        ? type.legal
        : type.labelMd;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        variant === 'pill' && styles.pillShape,
        variant === 'legal' && styles.legalShape,
        fullWidth && styles.fullWidth,
        surface(pressed),
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={label().color} />
      ) : (
        <>
          {leftIcon ? <View style={styles.icon}>{leftIcon}</View> : null}
          <Text style={[textStyle, label(), styles.labelReset]} numberOfLines={1}>
            {children}
          </Text>
          {rightIcon ? <View style={styles.icon}>{rightIcon}</View> : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderRadius: radius.lg,
  },
  md: { paddingVertical: space.md, paddingHorizontal: space.lg },
  sm: { paddingVertical: space.sm, paddingHorizontal: space.md },
  // Pricing sub-system only.
  pillShape: { borderRadius: radius.pill },
  legalShape: { borderRadius: radius.xs },
  fullWidth: { width: '100%' },
  icon: { alignItems: 'center', justifyContent: 'center' },
  // Presets carry a colour for standalone text; the variant overrides it here.
  labelReset: { textAlign: 'center' },
});
