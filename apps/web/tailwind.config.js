/** @type {import('tailwindcss').Config} */
// Petra Nutrition Design System. Colours, spacing and radii all resolve to the
// CSS custom properties in src/styles/tokens.css, which is generated from
// packages/shared/src/design/tokens.ts.
module.exports = {
  // No dark mode: the system is white-canvas only. Dark appears as documented
  // full-bleed *surfaces* (signature-dark), never as a theme.
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    // Tailwind's defaults plus `nav` — the redesign's single structural
    // breakpoint (tokens.ts `breakpoint.nav`). Declared in full rather than
    // under `extend` so `nav:` sorts between md and lg in the cascade; an
    // extended screen would land after 2xl and silently win over xl:/2xl:.
    screens: {
      sm: '640px',
      md: '768px',
      nav: '900px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    container: {
      center: true,
      // The system's horizontal breathing room and 1280px content max.
      padding: 'var(--fluid-gutter)',
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
          // Warm pastels: demo-card surfaces only, never accents.
          peach: 'var(--petra-peach)',
          mint: 'var(--petra-mint)',
          yellow: 'var(--petra-yellow)',
        },
        // Product-UI roles from tokens/app-semantic.css. Coral and forest are
        // sanctioned here as *type* colours (both clear 7:1 on white).
        app: {
          danger: 'var(--app-danger)',
          success: 'var(--app-success-surface)',
          warning: 'var(--app-warning-surface)',
        },
        surface: {
          soft: 'var(--surface-soft)',
          strong: 'var(--surface-strong)',
        },
        ink: 'var(--petra-ink)',
        body: 'var(--petra-body)',
        hairline: 'var(--border-hairline)',
        link: 'var(--color-link)',
        // The only translucencies allowed over a dark surface.
        'on-dark': {
          muted: 'var(--app-on-dark-muted)',
          surface: 'var(--app-on-dark-surface)',
          hairline: 'var(--app-on-dark-hairline)',
        },
      },
      maxWidth: {
        container: 'var(--container-max)',
        app: 'var(--app-max)',
        reading: 'var(--reading-max)',
      },
      width: {
        rail: 'var(--rail-width)',
      },
      minHeight: {
        // The smallest touch target the redesign uses, and its primary CTA.
        target: '44px',
        cta: '52px',
      },
      height: {
        header: 'var(--header-height)',
        tabbar: 'var(--tab-bar-height)',
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
        // Fluid steps from the redesign (tokens.ts `fluid`).
        gutter: 'var(--fluid-gutter)',
        'gutter-app': 'var(--fluid-gutter-app)',
        band: 'var(--fluid-band)',
        'hero-top': 'var(--fluid-hero-top)',
        card: 'var(--fluid-card-pad)',
        'card-lg': 'var(--fluid-card-pad-lg)',
        fluid: 'var(--fluid-gap)',
        'fluid-lg': 'var(--fluid-gap-lg)',
        tabbar: 'var(--tab-bar-height)',
        header: 'var(--header-height)',
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
        lead: ['var(--text-lead)', { lineHeight: 'var(--lh-title)' }],
        'body-lg': ['var(--text-body-lg)', { lineHeight: '1.55' }],
        'label-sm': ['var(--text-label-sm)', { lineHeight: 'var(--lh-snug)' }],
        eyebrow: [
          'var(--text-eyebrow)',
          { lineHeight: 'var(--lh-snug)', letterSpacing: '0.16px' },
        ],
        micro: ['var(--text-micro)', { lineHeight: 'var(--lh-tight)' }],
        // Fluid display sizes; line heights from the prototype.
        hero: ['var(--fluid-text-hero)', { lineHeight: '1.08', letterSpacing: '-0.015em' }],
        display: ['var(--fluid-text-display)', { lineHeight: '1.08', letterSpacing: '-0.015em' }],
        section: ['var(--fluid-text-section)', { lineHeight: '1.15', letterSpacing: '-0.01em' }],
        'card-title': ['var(--fluid-text-card)', { lineHeight: '1.25' }],
        lede: ['var(--fluid-text-lede)', { lineHeight: '1.55' }],
        cook: ['var(--fluid-text-cook)', { lineHeight: '1.25' }],
        'cook-num': ['var(--fluid-text-cook-num)', { lineHeight: '1' }],
      },
      fontWeight: {
        regular: 'var(--weight-regular)',
        medium: 'var(--weight-medium)',
        // 600 — legal / cookie surfaces only.
        legal: 'var(--weight-bold)',
        // Inter Display mid-weights, pricing sub-system only.
        // (`font-pricing` is the family, so the weights take other names.)
        mid: 'var(--weight-pricing)',
        'mid-strong': 'var(--weight-pricing-strong)',
      },
    },
  },
  // No animation plugin: the system scopes animation out and documents a
  // no-hover policy, so decorative transitions have no home here.
  plugins: [
    // `grid-auto-[280px]` → the redesign's responsive grid:
    // repeat(auto-fit, minmax(min(100%, 280px), 1fr)). The `min(100%, …)` is
    // what stops a 280px minimum from overflowing a 320px phone.
    // `grid-fill-[…]` is the auto-fill variant, for grids whose last row should
    // keep its column width instead of stretching.
    ({ matchUtilities }) => {
      matchUtilities(
        {
          'grid-auto': value => ({
            gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${value}), 1fr))`,
          }),
          'grid-fill': value => ({
            gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${value}), 1fr))`,
          }),
        },
        {
          values: {
            92: '92px',
            160: '160px',
            200: '200px',
            220: '220px',
            240: '240px',
            260: '260px',
            280: '280px',
            300: '300px',
            320: '320px',
            340: '340px',
          },
        }
      );
    },
  ],
};
