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
 *
 * The word rules — plurals, synonyms, which words are preparation — are
 * `@petra/food-measures`', shared with the agent's retrieval and the compose
 * node's staples, so the recipe screen and the chat cannot disagree either.
 */
import { covers, ingredientWords, isStaple } from '@petra/food-measures';

export interface PantryEntry {
  name: string;
  quantity: number;
  unit: string;
  location?: string;
  expirationDate?: Date | null;
}

/**
 * The pantry entry that covers an ingredient, if any — `covers`: every
 * significant word of the pantry item's name appears in the ingredient's.
 * "garlic" covers "garlic cloves", "olive oil" covers "extra virgin olive oil",
 * "unsalted butter" covers "butter".
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
  const want = new Set(ingredientWords(ingredient));
  if (want.size === 0) return null;

  let best: { item: T; extra: number } | null = null;
  for (const item of pantry) {
    if (!covers(item.name, ingredient)) continue;
    const extra = want.size - new Set(ingredientWords(item.name)).size;
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
  /** Ingredients with nothing in the pantry to cover them, staples aside. */
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
    // A staple nobody recorded is still in the cupboard: salt and olive oil
    // are "have", not "Buy". One the pantry does record keeps its dates, so
    // butter about to turn still shows as use-soon.
    if (!hit && isStaple(ing.name)) {
      return {
        ingredientId: ing.id,
        status: 'have' as const,
        daysLeft: null,
      };
    }
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
