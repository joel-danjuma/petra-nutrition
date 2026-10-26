import {
  addQuantities,
  ingredientKey,
  unitFamily,
  unitKey,
  type Quantity,
} from '@petra/food-measures';

/**
 * One row per thing to buy.
 *
 * Shopping lists were keyed on the exact `name` + `unit` strings, so the same
 * milk arrived three times — 800 ml for a pie, 700 g for croquetas, 2 cups for
 * mandazi — and "Lemon Juice" twice, once in tablespoons and once in tsp.
 * This module decides when two lines are the same item and how to add them up,
 * and every way an item reaches a list goes through it: generating from a meal
 * plan, creating a list, and adding to one.
 *
 * What an item *is* (`ingredientKey`: "Melted Butter" and "butter" are one,
 * "Lemon" and "Lemon Juice" stay two) and how two quantities add
 * (`addQuantities`) are `@petra/food-measures`' — the same identity the pantry
 * match uses and the same unit table the nutrition panel converts with.
 */

/**
 * The full identity of a line: what it is, and whether it is spooned.
 *
 * A spoon measure and a whole item with the same name are nearly always two
 * different products — "Pepper 6" is bell peppers, "Pepper ½ tsp" is black
 * pepper; "Onion 38" and "Onion 4 tbsp" (onion granules) likewise — so they
 * never share a row. Everything else of the same name does.
 */
export const lineKey = (item: { name: string; unit: string }): string =>
  `${ingredientKey(item.name)}|${unitFamily(item.unit) === 'spoon' ? 'spoon' : 'main'}`;

/* ------------------------------------------------------------------- merge */

export interface MergeableItem {
  name: string;
  quantity: number;
  unit: string;
  recipeName?: string | null;
  notes?: string | null;
  isCompleted?: boolean;
}

/** "Fish pie, Flamiche" — each recipe once, in the order they asked. */
export const joinRecipes = (
  a?: string | null,
  b?: string | null
): string | null => {
  const names = [...(a ?? '').split(', '), ...(b ?? '').split(', ')]
    .map(s => s.trim())
    .filter(Boolean);
  return names.length ? [...new Set(names)].join(', ') : null;
};

const bucketOf = (unit: string): string => {
  const f = unitFamily(unit);
  if (f === 'mass' || f === 'volume') return 'weigh';
  if (f === 'spoon') return 'spoon';
  if (f === 'count') return 'count';
  return `unit:${unitKey(unit)}`;
};

/**
 * Total a group of lines that are the same item (same `lineKey`).
 *
 * Order-independent: lines are bucketed by kind — weights and liquids, spoons,
 * bare counts, and each other unit ("cloves", "bunch") — and each bucket is
 * added exactly. The main quantity is the weight/liquid total when there is
 * one, because that is the measurable thing to buy; then spoons; then counts;
 * then the largest other bucket. A count joins a weight when the item has a
 * known typical weight. Every other bucket survives as "Also …" in the notes,
 * so nothing a recipe asked for disappears.
 */
export function combine<T extends MergeableItem>(lines: readonly T[]): T {
  const [first] = lines;
  const buckets = new Map<string, Quantity>();
  for (const l of lines) {
    const b = bucketOf(l.unit);
    const seen = buckets.get(b);
    buckets.set(
      b,
      seen
        ? addQuantities(first.name, seen, l)
        : { quantity: l.quantity, unit: l.unit }
    );
  }

  const order = [
    'weigh',
    'spoon',
    'count',
    ...[...buckets.keys()].filter(k => k.startsWith('unit:')),
  ].filter(k => buckets.has(k));
  const primaryKey = order[0];
  let primary = buckets.get(primaryKey)!;
  buckets.delete(primaryKey);

  // "12 leeks" can join "4 kg" of leeks when a leek has a known weight.
  const count = buckets.get('count');
  if (primaryKey === 'weigh' && count) {
    const joined = addQuantities(first.name, primary, count);
    if (!joined.extra) {
      primary = joined;
      buckets.delete('count');
    }
  }

  const also = [...buckets.values()].map(q =>
    `Also ${Math.round(q.quantity * 100) / 100} ${q.unit}`.trim()
  );
  // Earlier notes are kept as they are: after a top-up, an existing row's
  // "Also …" notes are the only record of what it could not add.
  const kept = lines
    .map(l => l.notes ?? '')
    .flatMap(n => n.split('; '))
    .map(n => n.trim())
    .filter(Boolean);
  const notes = [...new Set([...kept, ...also])].join('; ') || null;

  return {
    ...first,
    quantity: primary.quantity,
    unit: primary.unit,
    recipeName: lines.reduce<string | null>(
      (acc, l) => joinRecipes(acc, l.recipeName),
      null
    ),
    notes,
    // Needed again if any line still needs buying.
    isCompleted: lines.every(l => l.isCompleted === true),
  };
}

/**
 * Fold `incoming` into `existing`: quantities added, recipes listed, and the
 * row un-ticked — something new needs buying.
 */
export function mergeInto<T extends MergeableItem>(
  existing: T,
  incoming: MergeableItem
): T {
  return {
    ...combine([existing, { ...incoming, isCompleted: false } as T]),
    isCompleted: false,
  };
}

/** Collapse a batch so each item appears once. Order of first appearance is kept. */
export function dedupeItems<T extends MergeableItem>(items: readonly T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = lineKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()].map(g =>
    g.length === 1 ? { ...g[0] } : combine(g)
  );
}
