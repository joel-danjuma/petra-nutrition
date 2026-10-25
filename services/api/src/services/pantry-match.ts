/**
 * Does the pantry already hold this ingredient?
 *
 * One answer, used by both the shopping-list generator (what to leave off the
 * list) and the recipe screen (Have / Use soon / Buy), so the two cannot
 * disagree about whether "garlic cloves" is the garlic in the cupboard.
 *
 * Deliberately simple and conservative: a word-set match, not a food
 * ontology. A false "you have it" is worse than a false "buy it" — the first
 * leaves someone mid-recipe without an ingredient.
 */

/** Words that describe an ingredient rather than name it. */
const DESCRIPTORS = new Set([
  'fresh',
  'large',
  'small',
  'medium',
  'ripe',
  'chopped',
  'sliced',
  'diced',
  'minced',
  'grated',
  'crushed',
  'whole',
  'organic',
  'free',
  'range',
  'extra',
  'virgin',
  'of',
  'a',
  'the',
  'clove',
  'cloves',
  'bunch',
  'handful',
  'pinch',
  'tin',
  'tins',
  'can',
  'cans',
  'jar',
  'bag',
  'pack',
  'packet',
  'to',
  'taste',
  'and',
  'or',
]);

const singular = (w: string) =>
  w.length > 4 && w.endsWith('oes')
    ? w.slice(0, -2) // tomatoes → tomato
    : w.length > 3 && w.endsWith('s') && !w.endsWith('ss')
      ? w.slice(0, -1)
      : w;

/** The significant words of a name: lower-cased, singular, descriptors dropped. */
export const nameWords = (name: string): string[] =>
  name
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(w => w && !DESCRIPTORS.has(w))
    .map(singular);

export interface PantryEntry {
  name: string;
  quantity: number;
  unit: string;
  location?: string;
  expirationDate?: Date | null;
}

/**
 * The pantry entry that covers an ingredient, if any. Matches when every
 * significant word of the pantry item's name appears in the ingredient's:
 * "garlic" covers "garlic cloves", "olive oil" covers "extra virgin olive oil".
 *
 * Only that direction. The reverse — a more specific pantry item standing in
 * for a general ingredient — is where the wrong answers live: "tinned
 * tomatoes" is not the fresh tomatoes a salad wants, "tomato puree" is not
 * tomatoes at all. Ties go to the closest name.
 */
export function findInPantry<T extends PantryEntry>(
  ingredient: string,
  pantry: readonly T[]
): T | null {
  const want = new Set(nameWords(ingredient));
  if (want.size === 0) return null;

  let best: { item: T; extra: number } | null = null;
  for (const item of pantry) {
    const have = nameWords(item.name);
    if (have.length === 0) continue;
    if (!have.every(w => want.has(w))) continue;
    const extra = want.size - new Set(have).size;
    if (!best || extra < best.extra) best = { item, extra };
  }
  return best?.item ?? null;
}

/** "3 tins", "250 ml", "half"… — what the pantry says it has. */
export const describeQuantity = (e: Pick<PantryEntry, 'quantity' | 'unit'>) =>
  `${Number.isInteger(e.quantity) ? e.quantity : Math.round(e.quantity * 10) / 10} ${e.unit}`.trim();

/* ------------------------------------------------------------ recipe match */

/** Within this many days an item counts as "use soon" — the pantry's cream row. */
export const USE_SOON_DAYS = 3;

export type IngredientStatus = 'have' | 'use-soon' | 'missing';

export interface PantryMatch {
  ingredients: Array<{
    ingredientId: string;
    status: IngredientStatus;
    /** Calendar days until the matched pantry item turns; null when undated. */
    daysLeft: number | null;
    /** What the pantry holds, e.g. "3 tins". Absent when missing. */
    have?: string;
  }>;
  /** Ingredients with nothing in the pantry to cover them. */
  toBuy: number;
  /** Distinct pantry items due within `USE_SOON_DAYS` that the recipe uses up. */
  clears: number;
}

const DAY = 24 * 60 * 60 * 1000;
const calendarDaysBetween = (from: Date, to: Date) =>
  Math.round(
    (new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime() -
      new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()) /
      DAY
  );

/**
 * Which of a recipe's ingredients the user already has, which of those are
 * about to turn, and how many need buying — the recipe screen's
 * Have / Use in 2 days / Buy column and its "Clears 3 items" fact.
 */
export function matchRecipeToPantry<T extends PantryEntry & { id: string }>(
  ingredients: ReadonlyArray<{ id: string; name: string }>,
  pantry: readonly T[],
  now: Date = new Date()
): PantryMatch {
  const cleared = new Set<string>();
  let toBuy = 0;

  const rows = ingredients.map(ing => {
    const hit = findInPantry(ing.name, pantry);
    if (!hit) {
      toBuy += 1;
      return {
        ingredientId: ing.id,
        status: 'missing' as const,
        daysLeft: null,
      };
    }
    const days = hit.expirationDate
      ? calendarDaysBetween(now, hit.expirationDate)
      : null;
    const soon = days !== null && days <= USE_SOON_DAYS;
    if (soon) cleared.add(hit.id);
    return {
      ingredientId: ing.id,
      status: soon ? ('use-soon' as const) : ('have' as const),
      daysLeft: days,
      have: describeQuantity(hit),
    };
  });

  return { ingredients: rows, toBuy, clears: cleared.size };
}
