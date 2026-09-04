/**
 * The mobile app's styling surface. Screens import from here and nowhere else —
 * no raw hex, no raw px. Values come from the Petra Nutrition Design System via
 * `@petra/shared/design`.
 */

import { Platform, ViewStyle } from 'react-native';
import { color } from '@petra/shared';

export { color, semantic, space, radius, fontSize, weight, lineHeight } from '@petra/shared';
export { type } from './typography';
export type { TypeName } from './typography';

/**
 * Elevation. The design system is colour-block first: signature cards,
 * callouts and content cards are FLAT. The primary CTA at rest is the only
 * shadow in the system, so this object has exactly one entry.
 *
 * RN supports a single shadow, so the DS's two-layer stack is collapsed to its
 * dominant ink layer; the faint blue second layer is not reproducible here.
 */
export const shadow: Record<'buttonRest' | 'none', ViewStyle> = {
  buttonRest: Platform.select({
    ios: {
      shadowColor: color.primaryActive,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.16,
      shadowRadius: 6,
    },
    default: { elevation: 2 },
  }) as ViewStyle,
  none: Platform.select({
    ios: { shadowOpacity: 0 },
    default: { elevation: 0 },
  }) as ViewStyle,
};

/**
 * On-dark values for Cook Mode and Scan. The design system documents dark
 * *surfaces*, not a dark theme — these are the only two translucencies
 * sanctioned for use over them, replacing the twelve ad-hoc white alphas the
 * screens previously invented.
 */
export const onDark = {
  text: color.white,
  textMuted: 'rgba(255, 255, 255, 0.62)',
  surface: 'rgba(255, 255, 255, 0.06)',
  hairline: 'rgba(255, 255, 255, 0.14)',
} as const;
