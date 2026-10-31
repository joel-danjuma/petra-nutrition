/**
 * The ingredient vocabulary that safety and diet filtering are built on.
 *
 * Extracted from `retrieval/index.ts` unchanged, because generation now needs
 * the same lists. Retrieval blocks an unsafe recipe from a shortlist; the
 * compose node must block an unsafe ingredient from a dish it is writing from
 * scratch. Those are the same question, and answering it from two copies of the
 * list is how a nut ends up in a nut-allergy recipe six months from now.
 *
 * Allergy safety must not depend on a prompt: the model is *told* the
 * constraint, and then the validator checks the output against these terms
 * independently. The prompt is the request; this is the enforcement.
 */

const STOP = new Set([
  'the', 'and', 'for', 'with', 'into', 'fresh', 'chopped', 'sliced', 'diced',
  'large', 'small', 'medium', 'finely', 'roughly', 'free', 'range', 'plain',
]);

/** Strip plurals and packaging words so "Chicken Thighs" matches "chicken thigh". */
export function normalise(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .map(w => (w.endsWith('es') ? w.slice(0, -2) : w.endsWith('s') ? w.slice(0, -1) : w))
    .filter(w => !STOP.has(w));
}

/**
 * Allergens are named as categories ("shellfish") but appear in ingredient
 * lists as specific items ("Frozen Seafood mix", "King Prawns"), so matching
 * the literal word misses the dish entirely. Each declared allergy expands to
 * the terms that actually show up in recipes.
 *
 * This is a filter that errs toward over-blocking, which is the right direction
 * for an allergy. It is NOT a safety guarantee: ingredient names are free text,
 * upstream data is inconsistent, and cross-contamination isn't modelled at all.
 * The UI says as much next to the severe-allergy callout.
 */
export const ALLERGEN_TERMS: Record<string, string[]> = {
  shellfish: [
    'shellfish', 'seafood', 'prawn', 'shrimp', 'crab', 'lobster', 'crayfish',
    'langoustine', 'scampi', 'mussel', 'clam', 'oyster', 'scallop', 'squid',
    'calamari', 'octopus', 'cockle', 'whelk', 'crustacean', 'mollusc', 'surimi',
  ],
  fish: [
    'fish', 'anchovy', 'anchovie', 'salmon', 'tuna', 'cod', 'haddock', 'mackerel',
    'sardine', 'trout', 'bass', 'halibut', 'monkfish', 'pollock', 'tilapia',
    'kipper', 'worcestershire',
  ],
  nut: [
    'nut', 'almond', 'walnut', 'pecan', 'cashew', 'pistachio', 'hazelnut',
    'macadamia', 'praline', 'marzipan', 'nutella', 'frangipane', 'amaretto',
  ],
  peanut: ['peanut', 'groundnut', 'satay'],
  dairy: [
    'milk', 'butter', 'cheese', 'cream', 'yoghurt', 'yogurt', 'ghee', 'parmesan',
    'mozzarella', 'cheddar', 'mascarpone', 'ricotta', 'creme', 'custard',
    'buttermilk', 'paneer', 'feta', 'halloumi',
  ],
  gluten: [
    'flour', 'bread', 'breadcrumb', 'pasta', 'wheat', 'barley', 'rye', 'couscous',
    'noodle', 'spaghetti', 'macaroni', 'pastry', 'filo', 'panko', 'semolina',
    'bulgur', 'seitan', 'cracker', 'biscuit',
  ],
  egg: ['egg', 'mayonnaise', 'meringue', 'aioli'],
  soy: ['soy', 'soya', 'tofu', 'edamame', 'miso', 'tempeh'],
  sesame: ['sesame', 'tahini', 'halva'],
  pork: [
    'pork', 'bacon', 'ham', 'chorizo', 'pancetta', 'prosciutto', 'lardon',
    'gammon', 'salami', 'pepperoni', 'lard',
  ],
};

/**
 * Meat and poultry terms, kept separate from ALLERGEN_TERMS because diets
 * exclude them while allergies generally do not.
 */
export const MEAT_TERMS = [
  'beef', 'steak', 'mince', 'brisket', 'veal', 'lamb', 'mutton', 'venison',
  'goat', 'oxtail', 'liver', 'kidney', 'tripe', 'suet', 'gelatin', 'gelatine',
  'meatball', 'burger', 'sausage', 'bolognese', 'stock cube', 'beef stock',
];

export const POULTRY_TERMS = [
  'chicken', 'turkey', 'duck', 'goose', 'poussin', 'quail', 'pheasant',
  'chicken stock', 'schnitzel',
];

/**
 * What each diet *excludes*.
 *
 * The dietary tag on a recipe is only a nudge in scoring, because the tag
 * vocabulary upstream is inconsistent and an absent tag proves nothing. The
 * reverse is not true: a recipe whose ingredients say "chicken thighs" is
 * definitively not pescatarian. So diets get a hard exclusion filter built
 * from ingredients, exactly like allergens — otherwise a pescatarian user's
 * shortlist comes back entirely chicken and the model refuses every turn.
 */
const DIET_EXCLUSIONS: Record<string, string[]> = {
  pescatarian: [...MEAT_TERMS, ...POULTRY_TERMS, ...ALLERGEN_TERMS.pork],
  vegetarian: [
    ...MEAT_TERMS, ...POULTRY_TERMS, ...ALLERGEN_TERMS.pork,
    ...ALLERGEN_TERMS.fish, ...ALLERGEN_TERMS.shellfish,
  ],
  vegan: [
    ...MEAT_TERMS, ...POULTRY_TERMS, ...ALLERGEN_TERMS.pork,
    ...ALLERGEN_TERMS.fish, ...ALLERGEN_TERMS.shellfish,
    ...ALLERGEN_TERMS.dairy, ...ALLERGEN_TERMS.egg, 'honey',
  ],
  'dairy-free': ALLERGEN_TERMS.dairy,
  'gluten-free': ALLERGEN_TERMS.gluten,
  halal: ALLERGEN_TERMS.pork,
  kosher: ALLERGEN_TERMS.pork,
};

/** Map a user's free-text diet onto the terms a matching recipe must not contain. */
export function expandDiet(raw: string): string[] {
  const key = raw.toLowerCase().trim().replace(/\s+/g, '-');
  for (const [diet, list] of Object.entries(DIET_EXCLUSIONS)) {
    if (key.includes(diet) || key.includes(diet.replace('-', ''))) return list;
  }
  // An unrecognised restriction excludes nothing — better to show the user
  // recipes and let the model reason about them than to return an empty list.
  return [];
}

/** Map a user's free-text allergy onto the terms that appear in recipes. */
export function expandAllergen(raw: string): string[] {
  const key = raw.toLowerCase().trim();
  const terms = new Set<string>(normalise(raw));

  for (const [category, list] of Object.entries(ALLERGEN_TERMS)) {
    // "No shellfish", "Shellfish allergy", "shellfish" all reach the same list.
    if (key.includes(category) || list.some(t => key.includes(t))) {
      for (const t of list) terms.add(t);
    }
  }
  // "Nut allergy" should also pull in peanut, which people expect.
  if (key.includes('nut')) for (const t of ALLERGEN_TERMS.peanut) terms.add(t);
  if (key.includes('dairy') || key.includes('lactose')) {
    for (const t of ALLERGEN_TERMS.dairy) terms.add(t);
  }
  if (key.includes('gluten') || key.includes('celiac') || key.includes('coeliac')) {
    for (const t of ALLERGEN_TERMS.gluten) terms.add(t);
  }
  return [...terms];
}

/* ------------------------------------------------- generic ingredient names */

/**
 * The generic words a cook uses for a specific ingredient.
 *
 * A method step saying "reserve a cup of the starchy pasta water" is correct
 * prose for a recipe whose ingredient list says "linguine" — but a checker
 * comparing step words against the ingredient list flags `pasta` as an
 * ingredient that doesn't exist, rejects a good recipe, and degrades the turn.
 * That exact sentence is in the failing case this work exists to fix, so the
 * mapping is load-bearing rather than decorative.
 *
 * Specific token on the left, the generics it licenses on the right.
 */
export const CATEGORY_ALIASES: Record<string, string[]> = {
  linguine: ['pasta', 'noodle'],
  spaghetti: ['pasta', 'noodle'],
  tagliatelle: ['pasta', 'noodle'],
  fettuccine: ['pasta', 'noodle'],
  penne: ['pasta'],
  fusilli: ['pasta'],
  rigatoni: ['pasta'],
  macaroni: ['pasta'],
  farfalle: ['pasta'],
  orzo: ['pasta'],
  noodle: ['pasta'],
  chicken: ['meat', 'poultry', 'protein'],
  turkey: ['meat', 'poultry', 'protein'],
  duck: ['meat', 'poultry', 'protein'],
  beef: ['meat', 'protein'],
  steak: ['meat', 'beef', 'protein'],
  lamb: ['meat', 'protein'],
  pork: ['meat', 'protein'],
  mince: ['meat', 'protein'],
  salmon: ['fish', 'protein'],
  tuna: ['fish', 'protein'],
  cod: ['fish', 'protein'],
  prawn: ['shellfish', 'seafood', 'protein'],
  tofu: ['protein'],
  breast: ['meat', 'protein'],
  thigh: ['meat', 'protein'],
  fillet: ['meat', 'protein'],
  pepper: ['veg', 'vegetable'],
  onion: ['veg', 'vegetable'],
  courgette: ['veg', 'vegetable'],
  aubergine: ['veg', 'vegetable'],
  mushroom: ['veg', 'vegetable'],
  tomato: ['veg', 'vegetable'],
  spinach: ['veg', 'vegetable', 'green'],
  broccoli: ['veg', 'vegetable'],
  carrot: ['veg', 'vegetable'],
  potato: ['veg', 'vegetable'],
  rice: ['grain'],
  quinoa: ['grain'],
  couscous: ['grain'],
  oil: ['fat'],
  butter: ['fat'],
  parmesan: ['cheese'],
  cheddar: ['cheese'],
  mozzarella: ['cheese'],
};

/**
 * Every token the method-step checker treats as naming a food.
 *
 * Deliberately a closed list. A step is only flagged for referencing a
 * nonexistent ingredient when it uses a word *from this list* that the recipe's
 * own ingredients don't cover — so an unknown cooking verb or a word we've
 * never heard of is ignored rather than guessed at. Over-flagging here rejects
 * good recipes, which is the more expensive mistake.
 */
export const FOOD_TOKENS: Set<string> = new Set([
  ...Object.values(ALLERGEN_TERMS).flat(),
  ...MEAT_TERMS,
  ...POULTRY_TERMS,
  ...Object.keys(CATEGORY_ALIASES),
  ...Object.values(CATEGORY_ALIASES).flat(),
  'garlic', 'ginger', 'chilli', 'chili', 'lemon', 'lime', 'orange', 'honey',
  'vinegar', 'wine', 'stock', 'broth', 'sugar', 'flour', 'oregano', 'basil',
  'thyme', 'rosemary', 'parsley', 'coriander', 'cumin', 'paprika', 'turmeric',
  'cinnamon', 'nutmeg', 'cayenne', 'saffron', 'olive', 'caper', 'anchovy',
  'leek', 'celery', 'cabbage', 'kale', 'pea', 'bean', 'lentil', 'chickpea',
  'corn', 'cucumber', 'avocado', 'apple', 'banana', 'berry', 'raisin',
  'coconut', 'yeast', 'mustard', 'ketchup', 'mayonnaise', 'sriracha',
  // "bell" only ever appears as half of "bell pepper", but it has to be a food
  // token rather than a descriptor: as a descriptor it collapses "bell pepper"
  // to "pepper", which then matches the black-pepper staple and a shop trip
  // gets treated as already in the cupboard.
  'bell',
]);

/**
 * The tokens a recipe's own ingredient list licenses in its method — its own
 * words, plus the generics a cook would naturally substitute for them.
 */
export function licensedTokens(ingredientNames: string[]): Set<string> {
  const out = new Set<string>();
  for (const name of ingredientNames) {
    for (const token of normalise(name)) {
      out.add(token);
      for (const alias of CATEGORY_ALIASES[token] ?? []) out.add(alias);
    }
  }
  return out;
}
