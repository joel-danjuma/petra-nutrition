/** @type {import('tailwindcss').Config} */
// Petra Nutrition Design System. Colours, spacing and radii all resolve to the
// CSS custom properties in src/styles/tokens.css, which is generated from
// packages/shared/src/design/tokens.ts.
module.exports = {
  // No dark mode: the system is white-canvas only. Dark appears as documented
  // full-bleed *surfaces* (signature-dark), never as a theme.
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      // The system's horizontal breathing room and 1280px content max.
      padding: 'var(--container-pad, 48px)',
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Signature surfaces — full-bleed only, never small accents.
        signature: {
          coral: 'var(--signature-coral)',
          forest: 'var(--signature-forest)',
          cream: 'var(--signature-cream)',
          dark: 'var(--surface-dark)',
        },
      },
      // The system's full radius scale. `xl`/`2xl` deliberately resolve to the
      // same 12px as `lg` so stray `rounded-2xl` can't reintroduce a 16px
      // corner the system doesn't have. `pill` is pricing-only.
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-lg)',
        '2xl': 'var(--radius-lg)',
        '3xl': 'var(--radius-lg)',
        pill: 'var(--radius-pill)',
      },
      spacing: {
        xxs: 'var(--space-xxs)',
        xs: 'var(--space-xs)',
        sm: 'var(--space-sm)',
        md: 'var(--space-md)',
        lg: 'var(--space-lg)',
        xl: 'var(--space-xl)',
        xxl: 'var(--space-xxl)',
        section: 'var(--space-section)',
      },
      boxShadow: {
        // Colour-block first: the primary CTA at rest is the only shadow.
        button: 'var(--shadow-button-rest)',
        focus: 'var(--shadow-focus-ring)',
        none: 'none',
      },
      fontFamily: {
        // Wired to the next/font loader in src/app/layout.tsx.
        sans: ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'],
        pricing: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xl': ['var(--text-display-xl)', { lineHeight: 'var(--lh-display)' }],
        'display-lg': ['var(--text-display-lg)', { lineHeight: 'var(--lh-display-lg)' }],
        'display-md': ['var(--text-display-md)', { lineHeight: 'var(--lh-display-lg)' }],
        'title-lg': ['var(--text-title-lg)', { lineHeight: 'var(--lh-title)' }],
        'title-md': ['var(--text-title-md)', { lineHeight: 'var(--lh-title-md)' }],
        'title-sm': ['var(--text-title-sm)', { lineHeight: 'var(--lh-snug)' }],
        'label-md': ['var(--text-label-md)', { lineHeight: 'var(--lh-snug)' }],
        'body-md': ['var(--text-body-md)', { lineHeight: 'var(--lh-body)' }],
        caption: ['var(--text-caption)', { lineHeight: 'var(--lh-title)' }],
        legal: ['var(--text-legal)', { lineHeight: 'var(--lh-tight)' }],
      },
      fontWeight: {
        regular: 'var(--weight-regular)',
        medium: 'var(--weight-medium)',
        // 600 — legal / cookie surfaces only.
        legal: 'var(--weight-bold)',
      },
    },
  },
  // No animation plugin: the system scopes animation out and documents a
  // no-hover policy, so decorative transitions have no home here.
  plugins: [],
};
