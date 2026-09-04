# Petra Nutrition — Design System

A sober, editorial design system for **Petra Nutrition**, a nutrition-planning workflow product. The marketing surfaces read like a print magazine: white canvas, dark-ink type, generous whitespace, and a near-black pill-free CTA — nothing fights for attention until a section needs it. Brand voltage does **not** come from gradients or accent walls; it comes from **full-bleed signature cards** in coral, forest green, cream, and dark navy that punctuate long-scroll explainer pages every two or three screens.

Type runs **Space Grotesk** at modest weights (400 for display, 500 for sub-titles and buttons) — never bold for its own sake. The pricing surface runs a deliberate sub-dialect: **Inter Display** at unusual mid-weights (475 / 575) with pill-shaped buttons that appear nowhere else.

---

## Sources

This system was built from a single provided brand specification:

- **`uploads/Petra-Nutrition-Design-System.md`** — a full design-token + component specification (front-matter tokens for colors, typography, radius, spacing, and a `components:` block; prose sections on Overview, Colors, Typography, Layout, Elevation, Shapes, Components, Do's/Don'ts, Responsive Behavior, Known Gaps).

No codebase, Figma file, logo assets, icon set, product screenshots, or slide decks were provided. Everything visual here is derived from that markdown spec. Where the spec noted values as inferred (e.g. pastel demo-grid hexes sampled from screenshots), that uncertainty carries forward — see **Caveats** at the bottom.

---

## Products & surfaces

The spec described exactly one product surface family: the **Petra Nutrition marketing website**. Documented pages:

- **Homepage** — hero band → coral signature card → partner logo strip → demo-card grid → cream callout → dark navy CTA → light-gray CTA banner → footer.
- **Platform page** — feature sections led by `display-md` headlines and tabbed feature cards.
- **Pricing page** — its own sub-system: Inter Display type, pill buttons, tier cards, and a long comparison table.
- **Articles page** — a single-page vertical-rainbow-stripe hero, a left topic-filter rail, and a 3-up article-card grid.

The nutrition-planning **application** was referenced in that spec only as "product UI fragments" shown inside demo cards, and was not specified in enough detail to recreate — so no app UI kit was built at first. That gap has since been closed by building the real product against this system: see **App UI layer** below and `components/app/`.

---

## Content fundamentals

**Voice.** Quietly editorial and confident. Copy is plain, declarative, and unhurried — it trusts whitespace and never oversells. Headlines are short statements, not slogans-with-punctuation.

- **Casing:** Sentence case everywhere in the editorial system — headlines, buttons, nav items. The only uppercase is the small category tag on article cards (e.g. `MARKETING`, `PRODUCT`). No ALL-CAPS headlines, no Title Case Buttons.
- **Person:** Speaks to the reader as **you** ("The plan that meets you where you are", "Start your plan with Petra Nutrition"). Petra Nutrition itself is referred to by name, third person — not "we".
- **Emphasis:** Comes from **size and color contrast**, never from bold weight or exclamation. Display type sits at weight 400–500. The only true bold (600) is reserved for legal / cookie surfaces — a deliberate signal that boldness means "system-required," not "exciting."
- **Punctuation & tone:** Calm and declarative. Minimal punctuation, no exclamation marks in the body voice, no rhetorical questions in headlines. Numbers and product names carry the specificity.
- **Emoji:** **None.** Emoji do not appear anywhere in this system — not in copy, not as icons, not in UI. Using them is off-brand.
- **Representative copy:** "Personalized plans in real time" · "The plan that meets you where you are" · "Start your plan with Petra Nutrition" · "Book demo" / "Sign up for free" / "Get started for free" (the CTA pair) · nav: Platform, Solutions, Resources, Enterprise, Pricing.

Sample partner / brand names used in placeholders (from the spec's logo strip): Verdant Market, Northfield Grocers, Bright Table Media, Form Weekly, Cedarline Wellness, Solstice Digest.

---

## Visual foundations

**Color.** White canvas (`--petra-canvas` #ffffff) is the floor of everything. Text is near-black ink (`--petra-ink` #181d26) for headlines, a softer `--petra-body` #333840 for running text. The **primary CTA is near-black**, NOT blue — the link blue (`--petra-link` #1b61c9) is only for inline links. Brand voltage is delivered exclusively through full-bleed **signature card surfaces**: dark coral/oxide `#aa2d00`, deep forest `#0a2e0e`, dark navy `#181d26`, and soft cream `#f5e9d4`, with warm pastels (peach, mint, yellow, mustard) carrying small product-UI fragments inside demo grids. Max one or two background colors compete on any given band. Signature colors are never used as small accents — always as full surfaces.

**Type.** Space Grotesk across the whole editorial system, display through body. Modest weights: 400 for 40–48px display, 500 for sub-titles/buttons/labels. Body copy is a small 14px / 400 throughout — the calmness is partly a function of small, even body text under large quiet headlines. Pricing pages switch entirely to Inter Display (substituted with Inter) at 475/575.

**Spacing.** 4px base unit; everything snaps to 4-multiples. The signature constant is **96px** (`--space-section`) of vertical padding on every major editorial band — this single rhythm value is what makes pages feel like a magazine. Card interiors: 48px inside signature cards, 32px inside feature/pricing cards, 24px inside cream callouts and demo cards. Content maxes at ~1280px centered with 48px horizontal breathing room.

**Backgrounds.** Flat color only. **No gradients, no mesh, no aurora, no atmospheric backdrop, no textures, no repeating patterns.** The hero is pure white — full stop. The single decorative exception is the articles-page vertical rainbow stripe hero, which is explicitly a one-page treatment, never promoted system-wide.

**Borders.** A single 1px hairline (`--petra-hairline` #dddddd) on inputs, secondary-button outlines, table dividers, and sub-nav rails. Disabled outlines use `--petra-border-strong` #9297a0. No decorative borders, no colored left-accent borders.

**Elevation & shadows.** Color-block first, shadow second. Signature cards, callouts, and demo cards are **flat — no shadow**; depth comes from color contrast against white canvas. The only shadow in the system is a soft drop on the primary CTA button, carrying a faint blue-tinted glow at low alpha (a holdover from the link color). Keyboard focus adds an outer blue ring. There is no soft-glow / heavy-elevation language anywhere.

**Corner radii.** Hierarchical and meaningful: `--radius-lg` 12px for primary CTAs and signature cards; `--radius-md` 10px for content/article cards and cream callouts; `--radius-sm` 6px for inputs; `--radius-full` for circular icon buttons and avatars; `--radius-xs` 2px for legal/cookie CTAs. **`--radius-pill` (9999px) is pricing-only** — it is a sub-system signal, not a general option.

**Cards.** No shadow, no colored borders. A card is defined by its **surface color** and its **radius** against the white canvas. Signature cards (coral/forest/dark) are 12px-radius, 48px-padded, white type. Cream callouts and demo cards are 10px-radius, softer surfaces. Demo-card heights are deliberately **uneven** within a grid to avoid a uniform "spec-sheet" feel.

**Animation.** The spec explicitly scopes animation out and documents a global **no-hover-styling policy** — only Default and Active/Pressed states are defined. Treat motion as minimal and functional: no bounces, no decorative transitions. Press state on the primary button darkens to `--petra-primary-active` #0d1218; that is the extent of documented state motion.

**Dark mode.** There is none. The system is white-canvas only; `--surface-dark` and `--surface-dark-elevated` are **full-bleed surfaces**, not a theme. White type stays white over them, and buttons on them stay solid white rather than inverting or going translucent.

**Imagery.** Product-UI screenshots retain native aspect ratios (4:3 / 16:10) cropped into 10px-radius containers; article thumbnails are 16:9 at 10px radius; testimonial avatars are perfect circles; hero illustrations bleed full-width with no rounding. The color vibe of imagery is warm and clean (matching the warm pastel demo surfaces) — no heavy grain, no duotone, no cool cinematic grade. **No real imagery was provided** — the UI kit uses labeled placeholders; see Caveats.

**Transparency & blur.** Not used. The system never inverts the nav over dark sections, never uses translucent on-dark buttons, and uses no backdrop blur. White stays white, even on dark surfaces (the secondary button stays a solid white button over the coral/forest/dark cards).

---

## App UI layer

The source specification covered only the marketing website, so this system originally shipped no app UI kit. Building the Petra Nutrition mobile and web product surfaced the archetypes that were missing, and `components/app/` now fills that gap.

Every one of them is composed **strictly from existing tokens**. No new hue, size, radius or shadow was introduced; where the product needed a role the marketing system had not named (a warning, a destructive action), the role is built from a surface the system already owns and recorded in `tokens/app-semantic.css`.

- **`TabBar`** — the product's bottom navigation. Active tint is `--text-ink`, not a brand accent, because this system's primary is near-black and color is never used as a small highlight.
- **`Chip`** — a selectable or informational tag. Takes `--radius-sm`, **not** `--radius-pill`: the pill radius is a pricing sub-system signal, so a pill-shaped chip would misread as a pricing control.
- **`ProgressRow`** — a labelled progress bar. The fill is ink rather than green; progress is not a success state, and signature colors are reserved for full surfaces.
- **`ListRow`** — one row of a grouped list, separated by the single hairline.
- **`CookStep`** — a hands-free cooking step on `--surface-dark`. A full-bleed dark *surface*, not a dark theme: type stays white and the emphasised control is a solid white button, exactly as the secondary button behaves over coral or forest.
- **`EmptyState`** — the quiet empty state for a list. A thin outline icon in muted ink, a 400-weight title, one calm sentence. Nothing colored, because an empty list is not an error.

### Product-UI semantic roles (`tokens/app-semantic.css`)

| Token | Built from | Used for |
|---|---|---|
| `--app-warning-surface` / `--app-warning-ink` | cream + ink | "needs using soon", matching `CreamCallout` |
| `--app-danger` / `--app-on-danger` | coral | destructive actions, expired items |
| `--app-success-surface` / `--app-on-success` | forest | zero-waste totals, completed cooks |
| `--app-on-dark-*` | white at 6% / 14% / 62% | the only translucencies sanctioned over a dark surface |

Coral and forest appear here as **type** colors as well as surfaces. That is consistent with the existing system — the pricing comparison table already draws its check glyph in `--petra-success` — and both clear 7:1 contrast on white. What remains forbidden is using a signature color as a small tinted *background*.

---

## Iconography

**No icon set was provided in the sources**, and the spec references only a handful of glyphs generically: circular icon-buttons for carousel controls / share / back, checkmarks in the pricing comparison table, a small numeric count badge on the active topic-filter item, and a hamburger for the mobile nav.

- **Substitution (flagged):** This system uses **[Lucide](https://lucide.dev)** (loaded from CDN) as the icon set. Lucide's thin, geometric, open stroke style is the closest freely-available match to Space Grotesk's geometric-grotesk character and the system's minimalist, hairline-driven surfaces. This is a substitution, not a documented brand choice — **if Petra Nutrition has a real icon set, please share it and it will replace Lucide.**
- **Style rules:** single-weight line icons, ~1.75–2px stroke, no filled/duotone variants, inherit `currentColor`. Icons are used sparingly and functionally — chevrons, arrows, check, x, menu, share, chevron-left/right for carousels.
- **No emoji, ever.** No Unicode dingbats as icons. No PNG icons. Where a check glyph is needed (pricing table, a checked ingredient), use Lucide `check` in `--petra-ink` or `--petra-success`.
- Icon-buttons are 40×40px circular, white background, hairline border, ink glyph.

---

## Logo

**No logo or brand mark was provided.** Per system rules, no logo has been drawn or reconstructed. Everywhere a mark would appear (top-nav wordmark, footer, thumbnail), the brand name **"Petra Nutrition"** is rendered in plain Space Grotesk type at weight 500. **Please provide the real logo / wordmark files** and they will be dropped into `assets/` and wired into the `TopNav`, `Footer`, and thumbnail.

---

## Index / manifest

Root files:
- **`styles.css`** — the single entry point consumers link. `@import`s the token files only.
- **`tokens/`** — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `radius.css`, `elevation.css`, `app-semantic.css`.
- **`readme.md`** — this file.
- **`SKILL.md`** — Agent-Skills-compatible manifest for use in Claude Code.
- **`thumbnail.html`** — homepage tile.
- **`assets/`** — icon usage notes; no logo (see above).

Foundation specimen cards (Design System tab): `guidelines/` — color, type, spacing, radius, elevation, and brand-voice cards.

Components (`components/`, namespace `window.PetraNutritionDesignSystem_20fba5`):
- **buttons/** — `Button` (primary · secondary · secondary-on-dark · pill · legal), `IconButton`, `TextLink`
- **navigation/** — `TopNav`, `Footer`, `TopicFilterRail`
- **cards/** — `SignatureCard` (coral · forest · dark), `CreamCallout`, `FeatureCardTabbed`, `DemoGridCard`, `ArticleCard`
- **marketing/** — `HeroBand`, `LogoStrip`, `CtaBandLight`
- **forms/** — `TextInput`
- **pricing/** — `PricingTierCard`, `PricingComparisonTable`
- **app/** — `TabBar`, `Chip`, `ProgressRow`, `ListRow`, `CookStep`, `EmptyState`

UI kits (`ui_kits/`):
- **marketing-site/** — interactive recreation: Homepage, Platform, Pricing, Articles.

### Intentional additions
- **`IconButton`** — the spec documents a `button-icon-circular` surface; exposed as its own component for the carousel/share/back affordances.
- **Lucide icon set** — substituted for the (unprovided) brand icon set; see Iconography.
- **`components/app/` + `tokens/app-semantic.css`** — the product UI layer, derived entirely from existing tokens; see App UI layer.

---

## Caveats

- **Fonts** are loaded from the Google Fonts CDN (`Space Grotesk`, and `Inter` standing in for the pricing-only `Inter Display`). "Inter Display" is not freely hostable; Inter is the closest match and supports the 475/575 mid-weights via its variable axis. Provide the real font files to self-host. Note that static font pipelines (React Native / `@expo-google-fonts`) cannot reach 475/575 and fall back to 500/600.
- **No logo, no icon set, no imagery, no product screenshots** were provided — see the Logo, Iconography, and Visual Foundations sections for what was substituted or left as placeholders.
- Pastel demo-grid hexes (peach/mint/yellow/mustard) were sampled from screenshots per the source spec and may shift seasonally.
- Hover, animation, and input error/success states are undocumented in the source (global no-hover policy) and are therefore minimal/omitted here.
- The **app layer** was derived from building the product, not from the original spec. It introduces no new values, but its archetypes are an interpretation of the system rather than a documented brand decision — review them against the real product spec when one exists.
