# Petra AI — Design Conventions

## Setup

No provider wrapper is required. All token CSS custom properties are defined in `styles.css` (the `:root` block) and available to any element on the page. Dark mode is toggled by a `.dark` class on a parent element.

Import components from `window.PetraUI`:
```jsx
const { Button } = window.PetraUI;
```

## Styling idiom: Tailwind + CSS tokens

This design system uses **Tailwind CSS utility classes** for layout, spacing, and typography, with **CSS custom property tokens** for brand colors and theming. New layout and glue code should always use Tailwind utilities — never raw CSS values for things Tailwind covers.

### Color tokens (use via Tailwind, never hardcode hex)

| Tailwind class | Token | Value |
|---|---|---|
| `bg-primary` / `text-primary` | `--primary` | Green `hsl(142 76% 36%)` |
| `text-primary-foreground` | `--primary-foreground` | Near-white |
| `bg-background` / `text-foreground` | `--background` / `--foreground` | Page base |
| `bg-card` / `text-card-foreground` | `--card` | Card surface |
| `bg-muted` / `text-muted-foreground` | `--muted` | Muted surface / secondary text |
| `border-border` | `--border` | Default border |
| `bg-destructive` | `--destructive` | Red for delete/danger |
| `bg-accent` | `--accent` | Hover state surface |

### Spacing and layout

Use Tailwind spacing (`p-4`, `gap-3`, `mb-6`, `px-8`), border radius (`rounded-md`, `rounded-lg`, `rounded-xl`), and shadow (`shadow-sm`, `shadow-md`) utilities directly.

### Predefined component classes (from styles.css)

| Class | Use |
|---|---|
| `.glass` | Glassmorphism card: semi-transparent white/dark bg, backdrop blur |
| `.gradient-bg` | Page-level gradient: green→blue→purple |
| `.recipe-card` | Card with hover shadow lift |
| `.chat-message` | Chat bubble base |
| `.chat-message.user` | User's message: `bg-primary` right-aligned |
| `.chat-message.assistant` | AI message: `bg-muted` left-aligned |
| `.pantry-item` | Pantry list row with hover border |
| `.shopping-item` | Shopping list row |
| `.shopping-item.completed` | Struck-through completed shopping item |

## Where the truth lives

- Token definitions: `styles.css` → `_ds_bundle.css` (`:root` and `.dark` blocks)
- Component styles: bundled via Tailwind into `_ds_bundle.css`
- Per-component API: each `<Name>.d.ts` and `<Name>.prompt.md`

## Idiomatic example

```jsx
// A Petra AI feature card — library component + Tailwind layout glue
const { Button } = window.PetraUI;

function FeatureCard({ title, description, ctaLabel, premium }) {
  return (
    <div className="recipe-card p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        {premium && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
            Premium
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      <Button variant="default" size="sm" className="w-fit">{ctaLabel}</Button>
    </div>
  );
}
```
