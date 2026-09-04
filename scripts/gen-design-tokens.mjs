#!/usr/bin/env node
/**
 * Generates the web app's CSS custom properties from the canonical token
 * module so the two can never drift.
 *
 *   node scripts/gen-design-tokens.mjs
 *
 * Source: packages/shared/src/design/tokens.ts
 * Output: apps/web/src/styles/tokens.css
 *
 * Every colour is emitted TWICE:
 *   - under the design system's own names as hex (`--petra-ink: #181d26`)
 *   - as a bare HSL triple under the shadcn-style names Tailwind maps to
 *     (`--primary: 219 23% 12%`), because the config and `toaster.tsx` consume
 *     them as `hsl(var(--x))`. Emitting hex into those would break silently.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  color,
  fontSize,
  layout,
  lineHeight,
  radius,
  shadow,
  space,
  weight,
} from '../packages/shared/src/design/tokens.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../apps/web/src/styles/tokens.css');

/** #rrggbb -> "H S% L%" (bare triple, the form `hsl(var(--x))` expects). */
function hexToHslTriple(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a 6-digit hex colour: ${hex}`);
  const [r, g, b] = m.slice(1).map(v => parseInt(v, 16) / 255);

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  const round = (n, dp = 0) => Number(n.toFixed(dp));
  return `${round(h)} ${round(s * 100, 1)}% ${round(l * 100, 1)}%`;
}

const kebab = s => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);

/**
 * shadcn-style role -> design-system token. `ring` deliberately does NOT map to
 * `primary`: a near-black focus ring on a near-black control is invisible, so
 * the system's blue focus colour carries it instead.
 */
const ROLES = {
  background: color.canvas,
  foreground: color.ink,
  card: color.canvas,
  'card-foreground': color.ink,
  popover: color.canvas,
  'popover-foreground': color.ink,
  primary: color.ink,
  'primary-foreground': color.white,
  secondary: color.surfaceSoft,
  'secondary-foreground': color.ink,
  muted: color.surfaceSoft,
  'muted-foreground': color.muted,
  accent: color.surfaceStrong,
  'accent-foreground': color.ink,
  destructive: color.coral,
  'destructive-foreground': color.white,
  success: color.success,
  'success-foreground': color.white,
  warning: color.cream,
  'warning-foreground': color.ink,
  border: color.hairline,
  input: color.hairline,
  ring: color.infoBorder,
};

const lines = [
  '/* GENERATED FILE — DO NOT EDIT.',
  ' * Source: packages/shared/src/design/tokens.ts',
  ' * Regenerate: node scripts/gen-design-tokens.mjs',
  ' *',
  ' * Petra Nutrition Design System. White canvas, near-black ink, no dark mode.',
  ' */',
  '',
  ':root {',
  '  /* ---- design-system palette (hex, DS names) ---- */',
];

for (const [name, value] of Object.entries(color)) {
  lines.push(`  --petra-${kebab(name)}: ${value};`);
}

lines.push(
  '',
  '  /* ---- semantic aliases ---- */',
  '  --color-primary: var(--petra-ink);',
  '  --color-primary-active: var(--petra-primary-active);',
  '  --color-on-primary: var(--petra-white);',
  '  --color-link: var(--petra-link);',
  '  --color-link-active: var(--petra-link-active);',
  '  --color-success: var(--petra-success);',
  '  --color-info: var(--petra-info);',
  '  --border-hairline: var(--petra-hairline);',
  '  --border-strong: var(--petra-border-strong);',
  '  --surface-canvas: var(--petra-canvas);',
  '  --surface-soft: var(--petra-surface-soft);',
  '  --surface-strong: var(--petra-surface-strong);',
  '  --surface-dark: var(--petra-surface-dark);',
  '  --surface-dark-elevated: var(--petra-surface-dark-elevated);',
  '  --signature-coral: var(--petra-coral);',
  '  --signature-forest: var(--petra-forest);',
  '  --signature-cream: var(--petra-cream);',
  '',
  '  /* ---- Tailwind roles (bare HSL triples for hsl(var(--x))) ---- */',
);

for (const [role, hex] of Object.entries(ROLES)) {
  lines.push(`  --${role}: ${hexToHslTriple(hex)};`);
}

lines.push(
  '',
  '  /* ---- spacing (4px base; 96px is the editorial band rhythm) ---- */',
);
for (const [name, value] of Object.entries(space)) {
  lines.push(`  --space-${kebab(name)}: ${value}px;`);
}

for (const [name, value] of Object.entries(layout)) {
  lines.push(`  --${kebab(name)}: ${value}px;`);
}

lines.push('', '  /* ---- radius (pill is pricing-only) ---- */');
for (const [name, value] of Object.entries(radius)) {
  lines.push(`  --radius-${kebab(name)}: ${value}px;`);
}
lines.push("  /* Tailwind's rounded-lg maps here: content-card radius */");
lines.push(`  --radius: ${radius.md}px;`);

lines.push(
  '',
  '  /* ---- typography: emphasis is size + colour, never bold ---- */',
);
for (const [name, value] of Object.entries(fontSize)) {
  lines.push(`  --text-${kebab(name)}: ${value}px;`);
}
for (const [name, value] of Object.entries(weight)) {
  lines.push(`  --weight-${kebab(name)}: ${value};`);
}
for (const [name, value] of Object.entries(lineHeight)) {
  lines.push(`  --lh-${kebab(name)}: ${value};`);
}

lines.push(
  '',
  '  /* ---- elevation: colour-block first. Cards are flat. ---- */',
  `  --shadow-button-rest: ${shadow.buttonRest};`,
  `  --shadow-focus-ring: ${shadow.focusRing};`,
  `  --shadow-card: ${shadow.card};`,
  '}',
  '',
);

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, lines.join('\n'), 'utf8');
console.log(`design tokens -> ${OUT}`);
