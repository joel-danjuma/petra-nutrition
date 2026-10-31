import {
  summariseMonth,
  type WasteLogRow,
} from '../../../src/services/waste-month';

const NOW = new Date(2026, 2, 24, 18, 0); // 24 March 2026
const at = (month: number, day: number) => new Date(2026, month, day, 12);
const log = (
  itemName: string,
  action: 'USED' | 'WASTED',
  grams: number | null,
  when: Date
): WasteLogRow => ({
  itemName,
  action,
  estimatedWeightGrams: grams,
  occurredAt: when,
});

describe('summariseMonth', () => {
  it('splits this month into cooked in time and lost, by weight', () => {
    const s = summariseMonth(
      [
        log('Rice', 'USED', 1200, at(2, 3)),
        log('Spinach', 'USED', 250, at(2, 20)),
        log('Coriander', 'WASTED', 30, at(2, 10)),
        // Last month — out of the totals.
        log('Milk', 'USED', 1000, at(1, 27)),
      ],
      NOW
    );
    expect(s.cookedInTimeKg).toBe(1.5);
    expect(s.wastedKg).toBe(0);
    expect(s.percentEaten).toBe(98);
  });

  it('has no percentage for a month with nothing weighed', () => {
    const s = summariseMonth([log('Eggs', 'USED', null, at(2, 5))], NOW);
    expect(s.percentEaten).toBeNull();
    expect(s.cookedInTimeKg).toBe(0);
  });

  it('names the most-wasted repeat in the last 30 days, ignoring case', () => {
    const s = summariseMonth(
      [
        log('Coriander', 'WASTED', 30, at(1, 28)), // 24 days ago: inside the window
        log('coriander ', 'WASTED', 30, at(2, 10)),
        log('Coriander', 'WASTED', 30, at(2, 18)),
        log('Yoghurt', 'WASTED', 500, at(2, 2)),
        log('Yoghurt', 'WASTED', 500, at(2, 12)),
      ],
      NOW
    );
    expect(s.overBought).toEqual({ itemName: 'Coriander', times: 3 });
  });

  it('does not call a single waste over-buying', () => {
    const s = summariseMonth([log('Lettuce', 'WASTED', 200, at(2, 1))], NOW);
    expect(s.overBought).toBeNull();
  });

  it('ignores repeats older than 30 days', () => {
    const s = summariseMonth(
      [
        log('Basil', 'WASTED', 20, at(0, 10)),
        log('Basil', 'WASTED', 20, at(2, 10)),
      ],
      NOW
    );
    expect(s.overBought).toBeNull();
  });
});
