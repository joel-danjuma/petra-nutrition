# Chip

A small selectable or informational tag — filter categories, dietary
preferences, recipe metadata. Part of the app UI layer.

```jsx
import { Chip } from 'PetraNutritionDesignSystem';

<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
  <Chip label="Produce" selected onSelect={() => {}} />
  <Chip label="Dairy" onSelect={() => {}} />
  <Chip label="35 min" />
</div>
```

Props: `label`, `selected`, `onSelect` (omit for a read-only tag), `onDark`,
`disabled`.

Chips take `--radius-sm`, **not** `--radius-pill`. The pill radius is a pricing
sub-system signal in this system, so a pill-shaped chip would read as a pricing
control. Selected chips sit on the near-black primary; there is no hover state,
only pressed.
