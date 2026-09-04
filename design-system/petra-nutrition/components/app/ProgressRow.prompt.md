# ProgressRow

A labelled progress bar — daily nutrition targets, a shopping-list pick-up
count, cook-mode step progress. Part of the app UI layer.

```jsx
import { ProgressRow } from 'PetraNutritionDesignSystem';

<ProgressRow label="Protein" value={0.64} readout="89 / 140 g" />
```

Props: `label`, `value` (0–1), `readout`.

The fill is `--color-primary` (ink), not green: progress is not a success state,
and signature colours are reserved for full surfaces.
