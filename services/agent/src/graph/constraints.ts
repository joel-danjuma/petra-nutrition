import type { AgentContext } from '@petra/agent-contract';

import { expandAllergen, expandDiet, normalise } from '../retrieval/terms';

/**
 * What the compose node is allowed to reach for, and what it must never touch.
 *
 * Two separate jobs, and they fail in opposite directions:
 *
 *  - The **allowed set** is about usefulness. "Create a recipe with chicken,
 *    linguine and peppers" is a request for a dish cookable *tonight*, so an
 *    output naming double cream is a failed answer even though nothing is
 *    unsafe about it. Over-permissiveness here produces a shopping list
 *    disguised as a recipe.
 *  - The **blocked set** is about safety. Over-permissiveness here puts a nut
 *    in a nut-allergy dish. It is derived from the same `expandAllergen` /
 *    `expandDiet` tables retrieval filters on, and checked in code against the
 *    model's output. The prompt states the constraint; this enforces it. A
 *    prompt is a request, and a request is not a guarantee.
 *
 * Blocking wins. A staple that collides with an allergen — butter, for a dairy
 * allergy — is not a staple for that user.
 */

/**
 * Assumed present in any kitchen. Never counted as an ingredient the user has
 * to go and buy, and never listed as "missing".
 *
 * The line is "would a competent cook expect to already have this?" Olive oil
 * yes; olives no. Dried oregano yes; fresh basil no. Garlic powder yes; a bulb
 * of garlic no — that one is genuinely a shop trip, and pretending otherwise is
 * how a recipe stops being cookable.
 */
export const STAPLES = [
  'salt',
  'sea salt',
  'black pepper',
  'white pepper',
  'olive oil',
  'vegetable oil',
  'sunflower oil',
  'butter',
  'water',
  'dried oregano',
  'dried basil',
  'dried thyme',
  'dried rosemary',
  'dried parsley',
  'dried mixed herbs',
  'bay leaf',
  'chilli flakes',
  'red pepper flakes',
  'paprika',
  'smoked paprika',
  'ground cumin',
  'ground coriander',
  'garlic powder',
  'onion powder',
  'ground cinnamon',
  'ground nutmeg',
  'turmeric',
  'curry powder',
  'cayenne pepper',
  'sugar',
  'plain flour',
];

/**
 * Words that describe an ingredient without changing what you'd buy.
 *
 * Needed because the allowed-set check is a subset test over tokens, and
 * "red bell pepper" must pass when the user said "bell peppers". Without this
 * the validator rejects a correct answer for saying `red`, the retry produces
 * the same thing, and every generation degrades.
 */
export const DESCRIPTORS = new Set([
  'red', 'green', 'yellow', 'orange', 'white', 'black', 'brown', 'ripe',
  'boneless', 'skinless', 'skin', 'bone', 'lean', 'raw', 'cooked', 'cook',
  'dried', 'dry', 'ground', 'whole', 'halved', 'quartered', 'cubed', 'minced',
  'grated', 'shredded', 'crushed', 'torn', 'trimmed', 'peeled', 'deseeded',
  'extra', 'virgin', 'fine', 'coarse', 'sea', 'flaky', 'unsalted', 'salted',
  'caster', 'granulated', 'freshly', 'cracked', 'thinly', 'thickly', 'strip',
  'fillet', 'piece', 'chunk', 'batonnet', 'julienne', 'wedge', 'slice', 'cube',
  'optional', 'taste', 'needed', 'required', 'plain', 'natural',
]);

export interface Constraints {
  /** Ingredients the user named in this turn, verbatim. */
  named: string[];
  /** Pantry names the API passed down. */
  pantry: string[];
  /** Named ∪ pantry ∪ staples, minus anything blocked. The compose set. */
  allowed: string[];
  /** Token union of `allowed`, for the subset test. */
  allowedTokens: Set<string>;
  /** Hard-blocked tokens: allergies first, then diet exclusions. */
  blockedTokens: Set<string>;
  /** Kept for prose — what the user actually declared. */
  allergies: string[];
  dietaryRestrictions: string[];
  healthGoals: string[];
  /** Explicit servings, when the user said. Null means infer and state it. */
  servings: number | null;
}

/**
 * Build the constraint set for one turn.
 *
 * `named` comes from the router — the ingredients the user actually asked for.
 * When the user names nothing, the pantry alone is the working set, which is
 * the "what can I make tonight?" case.
 */
export function deriveConstraints(
  context: AgentContext | undefined,
  named: string[],
  servings: number | null = null
): Constraints {
  const allergies = context?.allergies ?? [];
  const dietaryRestrictions = context?.dietaryRestrictions ?? [];

  const blockedTokens = new Set<string>([
    ...allergies.flatMap(expandAllergen),
    ...dietaryRestrictions.flatMap(expandDiet),
  ]);

  const pantry = context?.pantryNames?.length
    ? context.pantryNames
    : (context?.currentPantryItems ?? []);

  // Named ingredients are honoured even when they contradict a *diet* — the
  // user just said they have them and want them used, and a stated preference
  // is theirs to override. An allergy is not: it stays blocked, and the
  // compromise gets said out loud.
  const candidates = dedupe([...named, ...pantry, ...STAPLES]);
  const allowed = candidates.filter(name => !isBlocked(name, blockedTokens));

  const allowedTokens = new Set<string>();
  for (const name of allowed) for (const t of normalise(name)) allowedTokens.add(t);

  return {
    named,
    pantry,
    allowed,
    allowedTokens,
    blockedTokens,
    allergies,
    dietaryRestrictions,
    healthGoals: context?.healthGoals ?? [],
    servings,
  };
}

/** Does this ingredient name touch a blocked term? */
export function isBlocked(name: string, blockedTokens: Set<string>): boolean {
  if (!blockedTokens.size) return false;
  for (const t of normalise(name)) if (blockedTokens.has(t)) return true;
  return false;
}

/** Which blocked terms it touched — the retry needs to be told precisely. */
export function blockedTermsIn(name: string, blockedTokens: Set<string>): string[] {
  return normalise(name).filter(t => blockedTokens.has(t));
}

/**
 * Is this ingredient inside the allowed set?
 *
 * A subset test over content tokens, with descriptors discounted. Strict on
 * purpose: "chicken stock" fails on `stock` even though `chicken` is allowed,
 * because stock is a shop trip and the whole point of the allowed set is that
 * nothing in the output requires one.
 */
export function isAllowedIngredient(name: string, constraints: Constraints): boolean {
  const tokens = normalise(name).filter(t => !DESCRIPTORS.has(t));
  // A name that reduces to nothing but descriptors ("freshly cracked") tells us
  // nothing; treat it as unrecognised rather than silently allowed.
  if (!tokens.length) return false;
  return tokens.every(t => constraints.allowedTokens.has(t));
}

/** The tokens that put an ingredient outside the allowed set. */
export function unknownTokensIn(name: string, constraints: Constraints): string[] {
  return normalise(name)
    .filter(t => !DESCRIPTORS.has(t))
    .filter(t => !constraints.allowedTokens.has(t));
}

/**
 * Is this a staple — assumed present, never shopped for?
 *
 * The test is that the name is *no more specific* than a staple: every content
 * token it has must appear in that staple's name. "oil" and "olive oil" are
 * both the staple; "peanut butter" is not butter, and "bell pepper" is not
 * black pepper. The looser test — staple's tokens contained in the name — gets
 * both of those wrong, and getting them wrong means an allergen or a shopping
 * trip is quietly treated as already in the cupboard.
 */
export function isStaple(name: string): boolean {
  const tokens = normalise(name).filter(t => !DESCRIPTORS.has(t));
  if (!tokens.length) return false;
  return STAPLES.some(staple => {
    const st = new Set(normalise(staple).filter(t => !DESCRIPTORS.has(t)));
    return st.size > 0 && tokens.every(t => st.has(t));
  });
}

function dedupe(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
