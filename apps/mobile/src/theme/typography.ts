import { TextStyle } from 'react-native';
import { typePresets, TypePresetName } from '@petra/shared';

/**
 * React Native derivation of the design system's type presets.
 *
 * Two RN-specific translations happen here:
 *  - line heights become absolute pixels (the DS stores unitless multipliers);
 *  - weight is expressed by picking a concrete font family rather than setting
 *    `fontWeight`. expo-google-fonts ships one file per weight, and combining a
 *    named family with `fontWeight` renders the wrong face on Android.
 */

const SPACE_GROTESK: Record<string, string> = {
  '400': 'SpaceGrotesk_400Regular',
  '500': 'SpaceGrotesk_500Medium',
  '600': 'SpaceGrotesk_600SemiBold',
};

/**
 * Pricing dialect. The DS asks for Inter Display at 475/575, which is only
 * reachable through a variable font; expo-google-fonts ships static cuts, so
 * 500/600 stand in — the same class of substitution the DS itself documents
 * for using Inter in place of Inter Display.
 */
const INTER: Record<string, string> = {
  '400': 'Inter_400Regular',
  '475': 'Inter_500Medium',
  '500': 'Inter_500Medium',
  '575': 'Inter_600SemiBold',
  '600': 'Inter_600SemiBold',
};

function familyFor(family: string, weight: string): string {
  const table = family === 'Inter' ? INTER : SPACE_GROTESK;
  return table[weight] ?? table['400'];
}

function toTextStyle(name: TypePresetName): TextStyle {
  const p = typePresets[name];
  const style: TextStyle = {
    fontFamily: familyFor(p.family, p.weight),
    fontSize: p.size,
    lineHeight: Math.round(p.size * p.lineHeight),
    color: p.color,
  };
  if ('letterSpacing' in p && typeof p.letterSpacing === 'number') {
    style.letterSpacing = p.letterSpacing;
  }
  return style;
}

export const type = {
  displayXl: toTextStyle('displayXl'),
  displayLg: toTextStyle('displayLg'),
  displayMd: toTextStyle('displayMd'),
  titleLg: toTextStyle('titleLg'),
  titleMd: toTextStyle('titleMd'),
  titleSm: toTextStyle('titleSm'),
  labelMd: toTextStyle('labelMd'),
  bodyMd: toTextStyle('bodyMd'),
  caption: toTextStyle('caption'),
  legal: toTextStyle('legal'),
  pricingDisplay: toTextStyle('pricingDisplay'),
  pricingSection: toTextStyle('pricingSection'),
  pricingCardTitle: toTextStyle('pricingCardTitle'),
} satisfies Record<TypePresetName, TextStyle>;

export type TypeName = keyof typeof type;

/** The font map passed to `useFonts` in app/_layout.tsx. */
export const FONT_WEIGHTS_USED = [
  'SpaceGrotesk_400Regular',
  'SpaceGrotesk_500Medium',
  'SpaceGrotesk_600SemiBold',
  'Inter_400Regular',
  'Inter_500Medium',
  'Inter_600SemiBold',
] as const;
