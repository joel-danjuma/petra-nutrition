/**
 * Petra Nutrition — design tokens.
 *
 * Transcribed 1:1 from the Petra Nutrition Design System project
 * (20fba5a4-13a8-439b-84ad-780814dace3d), files `tokens/*.css`. This module is
 * the single source of truth for both apps: React Native consumes it directly,
 * and `scripts/gen-design-tokens.mjs` generates the web's CSS custom properties
 * from it so the two cannot drift.
 *
 * This is the ONLY file in the repo permitted to contain raw hex or px values.
 */

/* ------------------------------------------------------------------ colors */

/**
 * Base palette (`--petra-*`). The system is white-canvas / dark-ink; brand
 * voltage lives in the full-bleed signature surfaces, never in small accents.
 */
export const color = {
  /** near-black — primary CTA + display type. Never blue, never green. */
  ink: '#181d26',
  /** primary button press state */
  primaryActive: '#0d1218',
  /** running text */
  body: '#333840',
  /** captions, footer links, breadcrumbs */
  muted: '#41454d',
  /** the single 1px border colour */
  hairline: '#dddddd',
  /** disabled outline */
  borderStrong: '#9297a0',
  white: '#ffffff',

  /* surfaces */
  canvas: '#ffffff',
  surfaceSoft: '#f8fafc',
  surfaceStrong: '#e0e2e6',
  surfaceDark: '#181d26',
  surfaceDarkElevated: '#1d1f25',

  /* signature surfaces — full-bleed only, never small accents */
  coral: '#aa2d00',
  forest: '#0a2e0e',
  cream: '#f5e9d4',
  peach: '#fcab79',
  mint: '#a8d8c4',
  yellow: '#f4d35e',
  mustard: '#d9a441',

  /* semantic hues */
  /** inline links ONLY — never a button */
  link: '#1b61c9',
  linkActive: '#1a3866',
  info: '#254fad',
  infoBorder: '#458fff',
  success: '#006400',
  successBorder: '#39bf45',
  pricingInk: '#1d1f25',
} as const;

/**
 * Semantic roles the DS does not define but both apps need (warnings on
 * expiring pantry items, destructive delete actions). Deliberately built from
 * existing signature surfaces rather than introducing new hues — see the
 * `components/app/` push-back in the design-system project.
 */
export const semantic = {
  /** "needs using soon" — cream surface carries ink type, per CreamCallout */
  warningSurface: color.cream,
  warningInk: color.ink,
  /** destructive / error — the coral signature surface */
  danger: color.coral,
  dangerOn: color.white,
  successSurface: color.forest,
  successOn: color.white,
} as const;

/* ----------------------------------------------------------------- spacing */

/** Base unit 4px; everything snaps to 4-multiples. */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  /** the universal vertical rhythm between editorial bands */
  section: 96,
} as const;

export const layout = {
  containerMax: 1280,
  containerPad: 48,
  navHeight: 64,
  railWidth: 240,
} as const;

/* ------------------------------------------------------------------ radius */

/**
 * Hierarchical and meaningful. `pill` is PRICING-ONLY — it is a sub-system
 * signal, not a general option, so chips and badges use `sm`.
 */
export const radius = {
  /** legal / cookie CTAs */
  xs: 2,
  /** text inputs, small inline buttons, chips */
  sm: 6,
  /** content cards, article cards, cream callouts */
  md: 10,
  /** primary CTAs, signature cards */
  lg: 12,
  /** pricing sub-system CTAs ONLY */
  pill: 9999,
  /** circular icon buttons, avatars */
  full: 9999,
} as const;

/* -------------------------------------------------------------- typography */

export const fontFamily = {
  sans: 'Space Grotesk',
  /** pricing sub-system only (stands in for Inter Display) */
  pricing: 'Inter',
} as const;

/**
 * Emphasis comes from SIZE + COLOR, never from bold weight. `bold` (600) is
 * reserved for legal / ToS surfaces — a deliberate signal that boldness means
 * "system-required", not "exciting".
 */
export const weight = {
  regular: '400',
  medium: '500',
  bold: '600',
  /** Inter Display custom mid-weights, pricing sub-system only */
  pricing: '475',
  pricingStrong: '575',
} as const;

export const fontSize = {
  displayXl: 48,
  displayLg: 40,
  displayMd: 32,
  titleLg: 24,
  titleMd: 20,
  titleSm: 18,
  labelMd: 16,
  button: 16,
  bodyMd: 14,
  caption: 14,
  legal: 13.12,
  pricingDisplay: 44.8,
  pricingSection: 28,
  pricingCardTitle: 20,
} as const;

/** Unitless multipliers. React Native needs absolute values — see `theme/typography`. */
export const lineHeight = {
  display: 1.1,
  displayLg: 1.2,
  title: 1.35,
  titleMd: 1.5,
  tight: 1.2,
  body: 1.25,
  snug: 1.4,
} as const;

export const letterSpacing = {
  titleLg: 0.12,
  caption: 0.16,
} as const;

/* --------------------------------------------------------------- elevation */

/**
 * Colour-block first, shadow second. Depth comes from the contrast between
 * white canvas and signature surfaces — NOT from soft-glow layers. Cards,
 * callouts and signature surfaces are flat.
 */
export const shadow = {
  /** the only shadow in the system: the primary CTA at rest */
  buttonRest: '0 1px 2px rgba(13, 18, 24, 0.16), 0 2px 6px rgba(27, 97, 201, 0.10)',
  /** keyboard focus — deliberately blue, so it stays visible on near-black */
  focusRing: '0 0 0 3px rgba(69, 143, 255, 0.45)',
  /** cards carry no shadow; kept as a token for intent clarity */
  card: 'none',
} as const;

export type ColorToken = keyof typeof color;
export type SpaceToken = keyof typeof space;
export type RadiusToken = keyof typeof radius;
export type FontSizeToken = keyof typeof fontSize;
