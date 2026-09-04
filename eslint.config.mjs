import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2020,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  // ---------------------------------------------------------------------
  // Petra Nutrition Design System adherence.
  //
  // Mirrors `_adherence.oxlintrc.json` from the design-system project, so
  // "comply exactly with the design system" is a build failure rather than a
  // review opinion. The single source of truth for every value is
  // packages/shared/src/design/tokens.ts — the one file exempt from these rules.
  // ---------------------------------------------------------------------
  {
    files: ['apps/mobile/**/*.{ts,tsx}', 'apps/web/**/*.{ts,tsx}'],
    // The token layers are where raw values are allowed to exist — everything
    // downstream must reference them by name.
    ignores: ['packages/shared/src/design/**', 'apps/mobile/src/theme/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
          message:
            'Raw hex colour. Use a design-system token from @petra/shared (mobile: src/theme; web: a Tailwind token class).',
        },
        {
          selector: 'Literal[value=/\\brgba?\\(/]',
          message:
            'Raw rgb/rgba colour. Use a design-system token; on-dark translucency lives in mobile src/theme `onDark`.',
        },
        {
          selector: "Literal[value=/\\b(?:bg|text|border|ring|from|via|to)-(?:gray|green|blue|red|amber|orange|purple|emerald|yellow|rose|indigo|violet|pink|slate|zinc|neutral|stone)-\\d{2,3}\\b/]",
          message:
            'Raw Tailwind palette utility. Use a semantic token class (bg-primary, text-muted-foreground, border-border, bg-signature-*).',
        },
        {
          selector: "Literal[value=/\\bbg-gradient-to-|\\bbg-clip-text\\b/]",
          message:
            'Gradients are not part of this design system — backgrounds are flat colour, and hero backgrounds are pure white.',
        },
        {
          selector: "Literal[value=/\\bfont-(?:bold|semibold|extrabold|black)\\b/]",
          message:
            'Display type is weight 400-500 and never bold; 600 (font-legal) is reserved for legal surfaces. Emphasis comes from size and colour.',
        },
        {
          selector: "Literal[value=/\\bdark:/]",
          message:
            'This system is white-canvas only and documents no dark palette. Dark appears as a full-bleed surface (bg-signature-dark), not a theme.',
        },
        {
          selector: "Literal[value=/\\bhover:/]",
          message:
            'The system documents a no-hover policy — only default and active/pressed states. Use active: instead.',
        },
        {
          selector: "Literal[value=/[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2705}\\u{2713}\\u{2714}\\u{2605}\\u{2606}]/u]",
          message:
            'No emoji or Unicode dingbats anywhere in this system — use a Lucide icon.',
        },
        {
          selector: "Property[key.name='fontWeight'] > Literal[value=/^(?:600|700|800|900|bold)$/]",
          message:
            'Display type is never bold. Use a type preset from src/theme (`type.titleSm`, `type.displayMd`, …).',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@expo/vector-icons',
              message: 'The design system specifies Lucide. Import from lucide-react-native instead.',
            },
            {
              name: 'next-themes',
              message: 'Dark mode was removed — this system is white-canvas only.',
            },
          ],
        },
      ],
    },
  },
  // ------------------------------------------------------------------
  // Service boundaries.
  //
  // The split into api / agent / web is only real if nothing reaches across
  // it. Without this the seam erodes in a week: someone imports the retrieval
  // service directly "just this once" because it is right there in the same
  // repo, and the two services can no longer be deployed apart.
  //
  // The permitted channel between them is @petra/agent-contract; the permitted
  // shared implementation is @petra/service-kit.
  // ------------------------------------------------------------------
  {
    files: ['services/api/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Regex rather than a glob: minimatch's `**` will not match the
              // leading `..` segments of a relative import, so a glob silently
              // fails to catch exactly the import it exists to catch.
              regex: '(\\.\\./)+agent/|^@petra/agent(/|$)',
              message:
                'The API must reach the agent over HTTP, through services/agent-client.ts. ' +
                'Importing its internals would put Groq and the embedding model back in this process.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['services/agent/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(\\.\\./)+api/|^@petra/api(/|$)',
              message:
                'The agent is stateless with respect to user data. If you need something ' +
                'from the API, take it as a request field in @petra/agent-contract.',
            },
            {
              group: ['@petra/shared', '@petra/shared/*'],
              message:
                '@petra/shared re-exports React stores and design tokens. Use ' +
                '@petra/agent-contract for the wire types instead.',
            },
          ],
        },
      ],
    },
  },

  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/node_modules/**',
      'services/agent/src/generated/**',
      '**/*.config.js',
      '**/*.config.mjs',
    ],
  },
  prettier,
];
