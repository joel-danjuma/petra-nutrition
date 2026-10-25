import { toGrams } from '@petra/food-measures';

import { nameWords } from './pantry-match';

/**
 * One row per thing to buy.
 *
 * Shopping lists were keyed on the exact `name` + `unit` strings, so the same
 * milk arrived three times — 800 ml for a pie, 700 g for croquetas, 2 cups for
 * mandazi — and "Lemon Juice" twice, once in tablespoons and once in tsp.
 * This module decides when two lines are the same item and how to add them up,
 * and every way an item reaches a list goes through it: generating from a meal
 * plan, creating a list, and adding to one.
 */

/** Words that describe how an ingredient is prepared, not what to buy. */
const PREP = new Set([
  'melted',
  'softened',
  'beaten',
  'cooked',
  'boiled',
  'toasted',
  'roasted',
  'peeled',
  'deseeded',
  'trimmed',
  'halved',
  'quartered',
  'finely',
  'roughly',
  'thinly',
  'shredded',
  'zested',
  'room',
  'temperature',
  'cold',
  'warm',
  'hot',
  'plain',
  'unsalted',
  'salted',
  'good',
  'quality',
]);

/**
 * The identity of a shopping item: its significant words, lower-cased and
 * singular, preparation dropped, in order. "Melted Butter" and "butter" are one
 * item; "Lemon" and "Lemon Juice" stay two, because you buy them differently.
 */
export const itemKey = (name: string): string => {
  const words = nameWords(name.replace(/\([^)]*\)/g, ' ')).filter(
    w => !PREP.has(w)
  );
  return words.join(' ') || name.trim().toLowerCase();
};

/* -------------------------------------------------------------- quantities */

const MASS_G: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.35,
  ounce: 28.35,
  ounces: 28.35,
  lb: 453.6,
  lbs: 453.6,
  pound: 453.6,
  pounds: 453.6,
};

/** Liquids bought by volume. Cups sit here: a cup of milk is milk to buy. */
const VOLUME_ML: Record<string, number> = {
  ml: 1,
  millilitre: 1,
  milliliter: 1,
  millilitres: 1,
  milliliters: 1,
  l: 1000,
  litre: 1000,
  liter: 1000,
  litres: 1000,
  liters: 1000,
  cup: 240,
  cups: 240,
  'fl oz': 29.6,
};

/** Spoon measures, in teaspoons. */
const SPOON_TSP: Record<string, number> = {
  tsp: 1,
  teaspoon: 1,
  teaspoons: 1,
  tbsp: 3,
  tbs: 3,
  tablespoon: 3,
  tablespoons: 3,
};

/** Bare counts, however they are spelled. */
const COUNT = new Set([
  '',
  'pcs',
  'pc',
  'piece',
  'pieces',
  'whole',
  'each',
  'x',
  'item',
  'items',
]);

const norm = (unit: string) => unit.trim().toLowerCase().replace(/\.$/, '');
/** "cloves" and "clove" are one unit. */
const singularUnit = (unit: string) => {
  const u = norm(unit);
  return u.length > 3 && u.endsWith('s') ? u.slice(0, -1) : u;
};

type Family = 'mass' | 'volume' | 'spoon' | 'count' | 'other';

const familyOf = (unit: string): Family => {
  const u = norm(unit);
  if (MASS_G[u] !== undefined) return 'mass';
  if (VOLUME_ML[u] !== undefined) return 'volume';
  if (SPOON_TSP[u] !== undefined) return 'spoon';
  if (COUNT.has(u)) return 'count';
  return 'other';
};

/**
 * The full identity of a line: what it is, and whether it is spooned.
 *
 * A spoon measure and a whole item with the same name are nearly always two
 * different products — "Pepper 6" is bell peppers, "Pepper ½ tsp" is black
 * pepper; "Onion 38" and "Onion 4 tbsp" (onion granules) likewise — so they
 * never share a row. Everything else of the same name does.
 */
export const lineKey = (item: { name: string; unit: string }): string =>
  `${itemKey(item.name)}|${familyOf(item.unit) === 'spoon' ? 'spoon' : 'main'}`;

const round = (n: number) => Math.round(n * 100) / 100;
const half = (n: number) => Math.round(n * 2) / 2;

/** A weight or a liquid sum, shown in the unit a shopper would use. */
const present = (
  family: 'mass' | 'volume',
  base: number
): { quantity: number; unit: string } =>
  family === 'mass'
    ? base >= 1000
      ? { quantity: round(base / 1000), unit: 'kg' }
      : { quantity: Math.round(base), unit: 'g' }
    : base >= 1000
      ? { quantity: round(base / 1000), unit: 'l' }
      : { quantity: Math.round(base), unit: 'ml' };

/** Spoons stay spoons: 2 tbsp + 4 tsp is "3.5 tbsp", not "50 ml". */
const presentSpoons = (tsp: number): { quantity: number; unit: string } =>
  tsp >= 3
    ? { quantity: half(tsp / 3), unit: 'tbsp' }
    : { quantity: half(tsp) || round(tsp), unit: 'tsp' };

export interface Quantity {
  quantity: number;
  unit: string;
}

/**
 * Add two quantities of the same item (same `lineKey`).
 *
 * Exact where the units allow it — weights with weights, liquids with liquids,
 * spoons with spoons, counts with counts. A weight and a liquid meet in grams
 * through `@petra/food-measures`, the conversion the nutrition panel uses. A
 * count joins a weight the same way when the item has a known typical weight
 * ("12 leeks" + "4 kg"). Anything else — "24 garlic" + "76 cloves" — keeps the
 * first quantity and returns the other as `extra`, shown as a note rather than
 * converted into a number nobody shops by.
 */
export function addQuantities(
  name: string,
  a: Quantity,
  b: Quantity
): Quantity & { extra?: string } {
  const fa = familyOf(a.unit);
  const fb = familyOf(b.unit);
  const ua = norm(a.unit);
  const ub = norm(b.unit);

  if (fa === 'spoon' && fb === 'spoon') {
    return presentSpoons(
      a.quantity * SPOON_TSP[ua] + b.quantity * SPOON_TSP[ub]
    );
  }
  if (fa === fb && fa === 'mass') {
    return present('mass', a.quantity * MASS_G[ua] + b.quantity * MASS_G[ub]);
  }
  if (fa === fb && fa === 'volume') {
    return present(
      'volume',
      a.quantity * VOLUME_ML[ua] + b.quantity * VOLUME_ML[ub]
    );
  }
  if (
    (fa === 'count' && fb === 'count') ||
    singularUnit(a.unit) === singularUnit(b.unit)
  ) {
    return { quantity: round(a.quantity + b.quantity), unit: a.unit || b.unit };
  }

  const weighable = (f: Family) => f === 'mass' || f === 'volume';
  const countable = (f: Family) => f === 'count';
  if (
    (weighable(fa) && weighable(fb)) ||
    (fa === 'mass' && countable(fb)) ||
    (countable(fa) && fb === 'mass')
  ) {
    const ga = toGrams(name, a.quantity, a.unit).grams;
    const gb = toGrams(name, b.quantity, b.unit).grams;
    if (ga !== null && gb !== null) return present('mass', ga + gb);
  }

  return { ...a, extra: `${round(b.quantity)} ${b.unit}`.trim() };
}

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
  const f = familyOf(unit);
  if (f === 'mass' || f === 'volume') return 'weigh';
  if (f === 'spoon') return 'spoon';
  if (f === 'count') return 'count';
  return `unit:${singularUnit(unit)}`;
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
