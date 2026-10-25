import {
  byDaysLeft,
  daysLeft,
  dueLabel,
  isDueSoon,
  pantryArtFor,
  pantryUrgency,
} from '../src/utils/pantry';

// Tuesday 24 March 2026, late evening — late enough that a millisecond-based
// count would already have rolled tomorrow's items over to "0 days".
const NOW = new Date(2026, 2, 24, 22, 30);
const on = (d: number, h = 9) => new Date(2026, 2, d, h);

describe('daysLeft', () => {
  it('counts calendar days, not elapsed time', () => {
    expect(daysLeft(on(25, 1), NOW)).toBe(1);
    expect(daysLeft(on(24, 0), NOW)).toBe(0);
    expect(daysLeft(on(24, 23), NOW)).toBe(0);
  });

  it('goes negative once the date has passed', () => {
    expect(daysLeft(on(22), NOW)).toBe(-2);
  });

  it('accepts the ISO strings the API returns', () => {
    expect(daysLeft(on(27).toISOString(), NOW)).toBe(3);
  });

  it('returns null for a missing or unparseable date', () => {
    expect(daysLeft(undefined, NOW)).toBeNull();
    expect(daysLeft(null, NOW)).toBeNull();
    expect(daysLeft('not a date', NOW)).toBeNull();
  });
});

describe('dueLabel and urgency', () => {
  it.each([
    [null, 'stocked', 'Stocked'],
    [-1, 'expired', 'Past its date'],
    [0, 'today', 'Use today'],
    [1, 'soon', '1 day'],
    [3, 'soon', '3 days'],
    [4, 'later', '4 days'],
    [59, 'later', '59 days'],
    [60, 'stocked', 'Stocked'],
    [500, 'stocked', 'Stocked'],
  ] as const)('%p days → %s, "%s"', (days, urgency, label) => {
    expect(pantryUrgency(days)).toBe(urgency);
    expect(dueLabel(days)).toBe(label);
  });

  it('puts expired, today and the next three days on the cream surface', () => {
    expect([-1, 0, 1, 3].every(isDueSoon)).toBe(true);
    expect([4, 60, null].some(isDueSoon)).toBe(false);
  });
});

describe('byDaysLeft', () => {
  it('sorts soonest first and undated items last, without mutating', () => {
    const items = [
      { name: 'honey', expirationDate: undefined },
      { name: 'eggs', expirationDate: on(29) },
      { name: 'greens', expirationDate: on(26) },
      { name: 'avocado', expirationDate: on(24) },
    ];
    expect(byDaysLeft(items, NOW).map(i => i.name)).toEqual([
      'avocado',
      'greens',
      'eggs',
      'honey',
    ]);
    expect(items[0].name).toBe('honey');
  });
});

describe('pantryArtFor', () => {
  it.each([
    ['Tinned tomatoes', 'tomato-tin'],
    ['Tomatoes', 'tomato'],
    ['Extra virgin olive oil', 'olive-oil'],
    ['Hot sauce', 'sauce-bottle'],
    ['Free-range eggs', 'eggs'],
    ['Eggplant', 'jam-jar'],
    ['Baby spinach', 'greens'],
    ['Red peppers', 'tomato'],
    ['Black pepper', 'spice-jars'],
    ['Sourdough loaf', 'bread-loaf'],
    ['Greek yoghurt', 'milk-bottle'],
  ] as const)('%s → %s', (name, art) => {
    expect(pantryArtFor(name)).toBe(art);
  });

  it('falls back on the category when no word matches', () => {
    expect(pantryArtFor('Chicken thighs', 'MEAT')).toBe('tomato-tin');
    expect(pantryArtFor('Mystery item', 'DAIRY')).toBe('milk-bottle');
  });
});
