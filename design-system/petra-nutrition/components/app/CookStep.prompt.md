# CookStep

A hands-free cooking step on the system's dark surface, with step progress and
an optional timer. Part of the app UI layer.

```jsx
import { CookStep } from 'PetraNutritionDesignSystem';

<CookStep
  stepNumber={3}
  totalSteps={6}
  instruction="Skin-side down into a cold, dry pan. Bring it up to medium and render without touching it."
  timeLabel="12:00"
  timerRunning={false}
  onToggleTimer={() => {}}
/>
```

Props: `stepNumber`, `totalSteps`, `instruction`, `timeLabel`, `timerRunning`,
`onToggleTimer`.

This is a full-bleed dark **surface**, not a dark theme. Type stays white and the
emphasised control is a solid white button — the system never inverts a button or
makes it translucent over a dark surface.
