/**
 * Ingredient identity: when two names are the same thing, when a pantry item
 * covers an ingredient, and which ingredients are staples.
 *
 * There used to be nine answers to this, and they disagreed. The agent's
 * normaliser stripped any trailing "es", so "Apples" became "appl" and a
 * blocked-term pattern built from it could never match "apple"; retrieval
 * counted "Olive oil" as covering "sesame oil" because one word matched; the
 * staple test found "garlic" inside "garlic powder"; and the API's pantry
 * matcher and shopping list knew nothing about staples at all. Every one of
 * those is a single rule applied in a different way, so the rule lives here
 * once and the services call it.
 *
 * Pure, and deliberately not a food ontology. A word-level identity is
 * checkable and identical on every run; when it is wrong it errs toward "buy
 * it" rather than "you have it", because the first costs a trip and the second
 * leaves someone mid-recipe without an ingredient.
 */

/* ----------------------------------------------------------------- plurals */

/** Plurals the suffix rules below would get wrong. */
const IRREGULAR: Record<string, string> = {
  leaves: 'leaf',
  loaves: 'loaf',
  halves: 'half',
  geese: 'goose',
  // -ies → -y is right for "anchovies" and "berries", wrong for these.
  chillies: 'chilli',
  chilies: 'chili',
  cookies: 'cookie',
  brownies: 'brownie',
  smoothies: 'smoothie',
  veggies: 'veggie',
  molasses: 'molasses',
};

/**
 * One English plural rule for ingredient words.
 *
 * "tomatoes" → "tomato", "anchovies" → "anchovy", "peaches" → "peach",
 * "apples" → "apple". Words ending in -ss or -us are already singular
 * ("glass", "couscous", "asparagus"), and words of three letters or fewer are
 * left alone ("gas", "pea").
 */
export function singular(word: string): string {
  const w = word.toLowerCase();
  const irregular = IRREGULAR[w];
  if (irregular) return irregular;
  if (w.length <= 3 || w.endsWith('ss') || w.endsWith('us')) return w;
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith('oes')) return w.slice(0, -2);
  if (/(ch|sh|x|z|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}

/** Every plural spelling a singular word might appear as, itself included. */
function pluralForms(word: string): string[] {
  const forms = new Set([word, `${word}s`]);
  if (/(ch|sh|x|z|s|o)$/.test(word)) forms.add(`${word}es`);
  if (/[^aeiou]y$/.test(word)) forms.add(`${word.slice(0, -1)}ies`);
  for (const [plural, single] of Object.entries(IRREGULAR)) {
    if (single === word) forms.add(plural);
  }
  return [...forms];
}

/* ------------------------------------------------------------- vocabulary */

/**
 * Filler and packaging: words that never say what an ingredient is. "Garlic
 * cloves" is garlic; "a tin of tomatoes" is tomatoes.
 */
const NOISE = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'to', 'as', 'for', 'with', 'into',
  'taste', 'clove', 'bunch', 'handful', 'pinch', 'tin', 'can', 'jar', 'bag',
  'pack', 'packet',
]);

/**
 * Preparation, size and quality: how an ingredient arrives at the board, not
 * what it is. Ignored for identity and coverage, so "unsalted butter" is
 * butter and "finely chopped onion" is onion.
 *
 * Colours are deliberately *not* here. "Black pepper" and "red pepper" differ
 * only by colour and are entirely different things to buy, and "red onion"
 * stands in for "onion" only in the direction coverage already allows.
 */
const PREP = new Set([
  'fresh', 'freshly', 'large', 'small', 'medium', 'ripe', 'chopped', 'sliced',
  'diced', 'minced', 'grated', 'crushed', 'whole', 'organic', 'free', 'range',
  'extra', 'virgin', 'melted', 'softened', 'beaten', 'cooked', 'boiled',
  'toasted', 'roasted', 'peeled', 'deseeded', 'trimmed', 'halved', 'quartered',
  'cubed', 'torn', 'shredded', 'zested', 'finely', 'roughly', 'thinly',
  'thick', 'thickly', 'room', 'temperature', 'cold', 'warm', 'plain', 'natural',
  'unsalted', 'salted', 'good', 'quality', 'boneless', 'skinless', 'lean',
  'raw', 'cracked', 'coarse', 'fine', 'flaky', 'sea', 'caster', 'granulated',
  'optional', 'needed', 'required',
]);

/**
 * Form words: kept, because they change what you are holding. Tinned tomatoes
 * are not the fresh tomatoes a salad wants, garlic powder is not a bulb of
 * garlic, and dried basil is not fresh basil.
 *
 * They need no special handling to be kept — anything not in `NOISE` or
 * `PREP` is — but naming them lets a caller ask for the ingredient with its
 * form set aside, which the nutrition table does to find "ground black
 * pepper" under "black pepper".
 */
export const FORM_WORDS: ReadonlySet<string> = new Set([
  'tinned', 'canned', 'jarred', 'dried', 'ground', 'powder', 'flake', 'frozen',
  'smoked',
]);

/**
 * One name per ingredient, whichever side of the Atlantic wrote the recipe.
 * The canonical spelling is the one the agent's term tables already use.
 */
const SYNONYMS: Array<[canonical: string, variants: string[]]> = [
  ['spring onion', ['scallion', 'green onion']],
  ['courgette', ['zucchini']],
  ['aubergine', ['eggplant']],
  ['coriander', ['cilantro']],
  ['chilli', ['chili']],
  ['yoghurt', ['yogurt']],
  ['chickpea', ['garbanzo bean', 'garbanzo', 'chick pea']],
];

/** Variant word sequences, longest first so "garbanzo bean" beats "garbanzo". */
const VARIANTS: Array<[from: string[], to: string[]]> = SYNONYMS.flatMap(
  ([canonical, variants]) =>
    variants.map(v => [v.split(' '), canonical.split(' ')] as [string[], string[]])
).sort((a, b) => b[0].length - a[0].length);

const canonicalise = (words: string[]): string[] => {
  const out: string[] = [];
  for (let i = 0; i < words.length; ) {
    const hit = VARIANTS.find(([from]) =>
      from.every((w, j) => words[i + j] === w)
    );
    if (hit) {
      out.push(...hit[1]);
      i += hit[0].length;
    } else {
      out.push(words[i]);
      i += 1;
    }
  }
  return out;
};

/* ---------------------------------------------------------------- identity */

/**
 * The significant words of a name, in order: lower-cased, singular, synonyms
 * folded to one spelling, filler and preparation dropped, form kept.
 *
 *   "2 large free-range Eggs"   → ["egg"]
 *   "Tinned tomatoes"           → ["tinned", "tomato"]
 *   "Garlic cloves, crushed"    → ["garlic"]
 *   "Scallions"                 → ["spring", "onion"]
 *
 * Works on prose as well as on names, so a method step and an ingredient line
 * reduce to comparable words.
 */
export function ingredientWords(name: string): string[] {
  const words = (name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(w => w.length > 1)
    .map(singular)
    .filter(w => !NOISE.has(w) && !PREP.has(w));
  return canonicalise(words);
}

/** Canonical names of more than one word, kept whole by `ingredientTerms`. */
const PHRASES = SYNONYMS.map(([canonical]) => canonical.split(' ')).filter(
  words => words.length > 1
);

/**
 * `ingredientWords`, with a multi-word canonical name kept as one term:
 * "red spring onions" → ["red", "spring onion"]. For a matcher that looks
 * each term up separately, such as SQL, and so needs "spring onion" whole to
 * find it spelled "scallion".
 */
export function ingredientTerms(name: string): string[] {
  const words = ingredientWords(name);
  const out: string[] = [];
  for (let i = 0; i < words.length; ) {
    const phrase = PHRASES.find(p => p.every((w, j) => words[i + j] === w));
    if (phrase) {
      out.push(phrase.join(' '));
      i += phrase.length;
    } else {
      out.push(words[i]);
      i += 1;
    }
  }
  return out;
}

/**
 * The identity of an ingredient, as a string: its significant words joined.
 * Two names with the same key are the same thing to buy. A name with no
 * significant words ("to taste") keys as itself, so it never merges with
 * another such name by accident.
 */
export function ingredientKey(name: string): string {
  return ingredientWords(name).join(' ') || (name || '').trim().toLowerCase();
}

/** "Apples" and "apple", "Scallions" and "spring onion". */
export function sameIngredient(a: string, b: string): boolean {
  return ingredientKey(a) === ingredientKey(b);
}

/**
 * Does a pantry item cover an ingredient? True when every significant word of
 * the pantry name appears in the ingredient's: "garlic" covers "garlic cloves",
 * "olive oil" covers "extra virgin olive oil", "unsalted butter" covers
 * "butter".
 *
 * Only that direction, and never on one shared word. "Olive oil" does not
 * cover "sesame oil"; "tinned tomatoes" does not cover "tomatoes", which is
 * the fresh thing a salad wants.
 */
export function covers(pantryName: string, ingredientName: string): boolean {
  const have = ingredientWords(pantryName);
  if (!have.length) return false;
  const want = new Set(ingredientWords(ingredientName));
  return have.every(w => want.has(w));
}

/* ----------------------------------------------------------------- staples */

/**
 * Assumed present in any kitchen. Never counted as an ingredient the user has
 * to go and buy, and never listed as missing.
 *
 * The line is "would a competent cook expect to already have this?" Olive oil
 * yes; olives no. Dried oregano yes; fresh basil no. Garlic powder yes; a bulb
 * of garlic no — that one is genuinely a shop trip, and pretending otherwise is
 * how a recipe stops being cookable.
 */
export const STAPLES: readonly string[] = [
  'salt',
  'sea salt',
  'black pepper',
  'ground black pepper',
  'white pepper',
  'oil',
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

const STAPLE_KEYS = new Set(STAPLES.map(ingredientKey));

/**
 * Is this a staple?
 *
 * An exact match on the key, with form words kept. Preparation is ignored —
 * "extra virgin olive oil" and "unsalted butter" are staples — but "garlic" is
 * not a staple because "garlic powder" is, "fresh basil" is not because
 * "dried basil" is, and "red pepper" is not because "black pepper" is.
 */
export function isStaple(name: string): boolean {
  const words = ingredientWords(name);
  return words.length > 0 && STAPLE_KEYS.has(words.join(' '));
}

/* --------------------------------------------------------------------- SQL */

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every spelling of a term: its synonyms, each in singular and plural. */
function spellings(term: string): string[] {
  const key = term.trim().toLowerCase();
  const group = SYNONYMS.find(
    ([canonical, variants]) => canonical === key || variants.includes(key)
  );
  const names = group ? [group[0], ...group[1]] : [key];
  return names.flatMap(name => {
    const words = name.split(/\s+/);
    const last = words.pop() as string;
    return pluralForms(singular(last)).map(form =>
      [...words, form].join(' ')
    );
  });
}

/**
 * A Postgres regular expression matching any of `terms` as whole words, in
 * any of their singular, plural or synonym spellings:
 *
 *   sqlTermPattern(['apple']) → '\y(apple|apples)\y'
 *
 * `\y` is Postgres's word boundary, so "nut" does not match "butternut".
 * Plurals are spelled out rather than approximated with `s?`, because "es"
 * and "ies" plurals are exactly the ones the approximation misses. Returns
 * null when there is nothing to match, so a caller can skip the clause.
 */
export function sqlTermPattern(terms: readonly string[]): string | null {
  const forms = [
    ...new Set(
      terms.map(t => t.trim().toLowerCase()).filter(Boolean).flatMap(spellings)
    ),
  ];
  if (!forms.length) return null;
  // Terms come from fixed tables and pantry names; escaping anyway means a
  // pantry item called "c++" cannot become a regex.
  return `\\y(${forms.map(escapeRegex).join('|')})\\y`;
}
