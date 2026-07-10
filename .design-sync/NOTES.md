# Petra AI Design Sync Notes

## Setup facts

- Entry: `packages/web/src/design-entry.ts` (synthetic — not a published dist)
  - The web package is a Next.js app, not a design system library. A synthetic entry re-exports the two framework-agnostic components.
- PKG_DIR resolves to `packages/web/` (converter walks up from entry to find package.json with a name)
- All config paths (cssEntry, tsconfig) must be relative to `packages/web/`, not the repo root
- Playwright installed in `.ds-sync/node_modules` (not in the repo's node_modules)

## Why landing/layout components are excluded

Hero, Features, HowItWorks, Testimonials, Pricing, CTA, Navbar, Footer all import from:
- `next/link` (Next.js specific — fails outside Next.js context)
- `framer-motion` (could be bundled but adds weight)
- `@petra/shared` useAuth hook (Zustand, needs store initialization)
- `next-themes` useTheme (needs ThemeProvider)

They're excluded in `componentSrcMap: { ...: null }`. If these are converted to proper design system components later, un-null them and provide a `cfg.provider` for the ThemeProvider/useTheme dependency.

## CSS

- `globals.css` uses `@tailwind` directives — not static CSS, requires PostCSS
- Pre-compiled via `npx tailwindcss -i src/styles/globals.css -o styles-compiled.css` from `packages/web/`
- The compiled file is committed at `packages/web/styles-compiled.css`
- On re-sync: re-run `cd packages/web && npx tailwindcss -i src/styles/globals.css -o styles-compiled.css` if tokens/utilities changed

## Fonts

- Inter and JetBrains Mono are runtime fonts loaded via Next.js `next/font/google`
- No `@font-face` to ship — suppressed via `runtimeFontPrefixes`
- In Claude Design, previews render with system-font fallback (acceptable for design agent use)

## Re-sync command

```bash
cd packages/web && npx tailwindcss -i src/styles/globals.css -o styles-compiled.css
cd ../..
cp -r "/path/to/skill/design-sync/package-build.mjs" .ds-sync/  # re-stage if skill updated
(cd .ds-sync && npm i esbuild ts-morph @types/react playwright)
node .ds-sync/resync.mjs \
  --config .design-sync/config.json \
  --node-modules packages/web/node_modules \
  --entry ./packages/web/src/design-entry.ts \
  --out ./ds-bundle \
  --remote .design-sync/.cache/remote-sync.json
```

## Known render warns

(none — clean at first sync)

## Re-sync risks

- `componentSrcMap` exclusions may become stale if Next.js components are refactored to remove the `next/link` / `@petra/shared` dependencies — check those nulls before each re-sync
- `styles-compiled.css` will drift from `globals.css` if Tailwind config or token definitions change without re-running the compile step
- Button authored preview (`previews/Button.tsx`) uses realistic copy from Petra AI UX — update if variant API changes
