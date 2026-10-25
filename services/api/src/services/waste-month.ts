/**
 * The monthly "less waste" report: what got cooked in time, what was lost,
 * and the one item the household keeps over-buying.
 *
 * Pure — the caller fetches the logs — so the arithmetic is testable without
 * a database.
 */

export interface WasteLogRow {
  itemName: string;
  action: 'USED' | 'WASTED';
  estimatedWeightGrams: number | null;
  occurredAt: Date;
}

export interface MonthSummary {
  /** Weight of logged items used before they turned, this calendar month. */
  cookedInTimeKg: number;
  /** Weight of logged items thrown away, this calendar month. */
  wastedKg: number;
  /**
   * Share of this month's logged weight that was eaten, 0–100. Null until
   * anything with a known weight has been logged — "100%" on an empty month
   * would be a claim with nothing behind it.
   */
  percentEaten: number | null;
  /**
   * An item thrown away at least `OVERBOUGHT_MIN` times in the last 30 days —
   * the most-wasted one if several qualify. Null when nothing repeats.
   */
  overBought: { itemName: string; times: number } | null;
}

export const OVERBOUGHT_MIN = 2;
const OVERBOUGHT_WINDOW_DAYS = 30;

const round1 = (n: number) => Math.round(n * 10) / 10;

export const startOfMonth = (now: Date): Date =>
  new Date(now.getFullYear(), now.getMonth(), 1);

/** Normalise item names so "Coriander" and "coriander " count as one. */
const key = (name: string) => name.trim().toLowerCase();

export function summariseMonth(
  logs: readonly WasteLogRow[],
  now: Date
): MonthSummary {
  const monthStart = startOfMonth(now).getTime();
  const windowStart =
    now.getTime() - OVERBOUGHT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  let usedG = 0;
  let wastedG = 0;
  const wasted = new Map<string, { itemName: string; times: number }>();

  for (const log of logs) {
    const t = log.occurredAt.getTime();
    if (t >= monthStart && t <= now.getTime()) {
      const g = log.estimatedWeightGrams ?? 0;
      if (log.action === 'USED') usedG += g;
      else wastedG += g;
    }
    if (log.action === 'WASTED' && t >= windowStart && t <= now.getTime()) {
      const k = key(log.itemName);
      const entry = wasted.get(k) ?? {
        itemName: log.itemName.trim(),
        times: 0,
      };
      entry.times += 1;
      wasted.set(k, entry);
    }
  }

  let overBought: MonthSummary['overBought'] = null;
  for (const entry of wasted.values()) {
    if (
      entry.times >= OVERBOUGHT_MIN &&
      (!overBought || entry.times > overBought.times)
    ) {
      overBought = entry;
    }
  }

  const total = usedG + wastedG;
  return {
    cookedInTimeKg: round1(usedG / 1000),
    wastedKg: round1(wastedG / 1000),
    percentEaten: total > 0 ? Math.round((usedG / total) * 100) : null,
    overBought,
  };
}
