# EmptyState

The empty state for a list or collection — an empty pantry, an unplanned day, a
search with no results. Part of the app UI layer.

```jsx
import { EmptyState, Button } from 'PetraNutritionDesignSystem';

<EmptyState
  icon={<i data-lucide="package" />}
  title="Your pantry is empty"
  body="Scan a barcode or a shelf of fresh food to get started."
  action={<Button variant="secondary">Scan something</Button>}
/>
```

Props: `icon`, `title`, `body`, `action`.

Quiet by construction: thin outline icon in muted ink, a 400-weight title, one
calm sentence. Nothing is coloured or illustrated — an empty list is not an error.
