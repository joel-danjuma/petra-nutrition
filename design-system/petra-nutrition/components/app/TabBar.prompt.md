# TabBar

The app's bottom navigation. Part of the app UI layer.

```jsx
import { TabBar } from 'PetraNutritionDesignSystem';

<TabBar
  activeId="today"
  onSelect={id => setTab(id)}
  items={[
    { id: 'today', label: 'Today', icon: <i data-lucide="house" /> },
    { id: 'petra', label: 'Petra', icon: <i data-lucide="message-square" /> },
    { id: 'pantry', label: 'Pantry', icon: <i data-lucide="refrigerator" /> },
  ]}
/>
```

Props: `items` (`{ id, label, icon }`), `activeId`, `onSelect`.

The active tint is `--text-ink`, not a brand accent — this system's primary is
near-black and colour is never a small highlight. One hairline above the bar; no
blur, elevation or fill.
