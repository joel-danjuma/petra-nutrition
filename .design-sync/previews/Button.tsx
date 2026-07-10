import { Button } from '@petra/web';

export const Variants = () => (
  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', padding: '24px', alignItems: 'center' }}>
    <Button variant="default">Get Started</Button>
    <Button variant="secondary">Learn More</Button>
    <Button variant="outline">View Recipe</Button>
    <Button variant="ghost">Cancel</Button>
    <Button variant="destructive">Delete</Button>
    <Button variant="link">See all recipes →</Button>
  </div>
);

export const Sizes = () => (
  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', padding: '24px', alignItems: 'center' }}>
    <Button size="lg" variant="default">Generate Meal Plan</Button>
    <Button size="default" variant="default">Add to Pantry</Button>
    <Button size="sm" variant="outline">Edit</Button>
    <Button size="icon" variant="outline">+</Button>
  </div>
);

export const States = () => (
  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', padding: '24px', alignItems: 'center' }}>
    <Button variant="default">Active</Button>
    <Button variant="default" disabled>Disabled</Button>
    <Button variant="outline" disabled>Disabled outline</Button>
  </div>
);
