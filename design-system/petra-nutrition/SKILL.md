---
name: petra-nutrition-design
description: Use this skill to generate well-branded interfaces and assets for Petra Nutrition, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick map
- `readme.md` — the full design guide: brand context, content fundamentals, visual foundations, iconography, and an index of everything here.
- `styles.css` — the single stylesheet consumers link; it `@import`s all tokens in `tokens/` (colors, typography, fonts, spacing, radius, elevation, app-semantic).
- `tokens/` — CSS custom properties. Base palette is `--petra-*`; semantic aliases are `--color-*`, `--text-*`, `--surface-*`, `--space-*`, `--radius-*`, `--font-*`, `--shadow-*`. Product-UI roles are `--app-*`.
- `components/` — React primitives (`buttons/`, `navigation/`, `cards/`, `marketing/`, `forms/`, `pricing/`) plus `app/` for the product UI layer.
- `ui_kits/marketing-site/` — an interactive recreation of the marketing site (Homepage, Platform, Pricing, Articles).
- `guidelines/` — foundation specimen cards (colors, type, spacing, brand).
- `assets/` — iconography + logo notes (no logo asset was provided).

## Non-negotiables
- Primary CTA is near-black `--color-primary` (#181d26). The link blue (#1b61c9) is ONLY for inline links, never a button.
- Display type is weight 400–500 — never bold. Emphasis comes from size + color, and from full-bleed signature cards (coral / forest / dark / cream).
- Hero backgrounds are pure white — no gradient, mesh, or atmospheric backdrop.
- Space Grotesk everywhere except the pricing sub-system, which uses Inter Display (475/575) with pill buttons.
- 96px vertical rhythm between editorial bands; never repeat a surface mode in consecutive bands.
- No emoji. Icons are Lucide (substituted). No hover-only styling — the system documents default + active/pressed.
- `--radius-pill` is pricing-only. Product-UI chips and badges take `--radius-sm` so they cannot read as a pricing control.
- There is no dark mode. Dark appears only as a full-bleed *surface* (`--surface-dark`), and white type stays white on it.
