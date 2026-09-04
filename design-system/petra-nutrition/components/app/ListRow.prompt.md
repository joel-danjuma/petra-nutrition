# ListRow

One row inside a grouped list — ingredients, shopping items, pantry entries,
settings. Part of the app UI layer.

```jsx
import { ListRow } from 'PetraNutritionDesignSystem';

<div style={{ border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)' }}>
  <ListRow title="Chicken thighs, bone-in" value="8" />
  <ListRow title="Broccoli, stalk and all" value="1 head" last />
</div>
```

Props: `title`, `value`, `detail`, `leading`, `trailing`, `onSelect`, `last`,
`muted`.

Rows are separated by the single 1px hairline. Set `last` on the final row so the
group doesn't double up on its container's border.
