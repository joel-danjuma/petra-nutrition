/**
 * Petra Nutrition — type presets.
 *
 * Platform-neutral mirrors of the design system's `.petra-*` utility classes
 * (see `tokens/typography.css` in the DS project). Line heights are unitless
 * multipliers here; React Native resolves them to absolute pixels in
 * `packages/mobile/src/theme/typography.ts`.
 *
 * Emphasis is size + colour. Nothing here is bolder than 500 except `legal`.
 */

import { color, fontFamily, fontSize, letterSpacing, lineHeight, weight } from './tokens';

export interface TypePreset {
  family: string;
  size: number;
  weight: string;
  lineHeight: number;
  color: string;
  letterSpacing?: number;
}

export const typePresets = {
  displayXl: {
    family: fontFamily.sans,
    size: fontSize.displayXl,
    weight: weight.medium,
    lineHeight: lineHeight.display,
    color: color.ink,
  },
  displayLg: {
    family: fontFamily.sans,
    size: fontSize.displayLg,
    weight: weight.regular,
    lineHeight: lineHeight.displayLg,
    color: color.ink,
  },
  displayMd: {
    family: fontFamily.sans,
    size: fontSize.displayMd,
    weight: weight.regular,
    lineHeight: lineHeight.displayLg,
    color: color.ink,
  },
  titleLg: {
    family: fontFamily.sans,
    size: fontSize.titleLg,
    weight: weight.regular,
    lineHeight: lineHeight.title,
    color: color.ink,
    letterSpacing: letterSpacing.titleLg,
  },
  titleMd: {
    family: fontFamily.sans,
    size: fontSize.titleMd,
    weight: weight.regular,
    lineHeight: lineHeight.titleMd,
    color: color.ink,
  },
  titleSm: {
    family: fontFamily.sans,
    size: fontSize.titleSm,
    weight: weight.medium,
    lineHeight: lineHeight.snug,
    color: color.ink,
  },
  labelMd: {
    family: fontFamily.sans,
    size: fontSize.labelMd,
    weight: weight.medium,
    lineHeight: lineHeight.snug,
    color: color.ink,
  },
  bodyMd: {
    family: fontFamily.sans,
    size: fontSize.bodyMd,
    weight: weight.regular,
    lineHeight: lineHeight.body,
    color: color.body,
  },
  caption: {
    family: fontFamily.sans,
    size: fontSize.caption,
    weight: weight.medium,
    lineHeight: lineHeight.title,
    color: color.muted,
    letterSpacing: letterSpacing.caption,
  },
  /** the only 600-weight preset — legal / cookie surfaces only */
  legal: {
    family: fontFamily.sans,
    size: fontSize.legal,
    weight: weight.bold,
    lineHeight: lineHeight.tight,
    color: color.ink,
  },

  /* pricing sub-system — Inter dialect */
  pricingDisplay: {
    family: fontFamily.pricing,
    size: fontSize.pricingDisplay,
    weight: weight.pricing,
    lineHeight: lineHeight.display,
    color: color.pricingInk,
  },
  pricingSection: {
    family: fontFamily.pricing,
    size: fontSize.pricingSection,
    weight: weight.pricing,
    lineHeight: lineHeight.displayLg,
    color: color.pricingInk,
  },
  pricingCardTitle: {
    family: fontFamily.pricing,
    size: fontSize.pricingCardTitle,
    weight: weight.pricing,
    lineHeight: 1.3,
    color: color.pricingInk,
  },
} as const satisfies Record<string, TypePreset>;

export type TypePresetName = keyof typeof typePresets;
