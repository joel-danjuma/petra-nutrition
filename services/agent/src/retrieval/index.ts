import { prisma } from '../db';
import { logger } from '../utils/logger';
import { MODEL_ID, cosine, embed } from './embedding';

/**
 * Hybrid recipe retrieval.
 *
 * Three signals, deliberately kept separate because they answer different
 * questions:
 *
 *  - **ingredient overlap** — "what can I cook tonight?" This is a set-cover
 *    problem, and it is the signal that actually matters for a pantry app.
 *    Embeddings are poor at it: a vector can't tell you that you're missing
 *    the one ingredient the dish is named after.
 *  - **lexical** (pg_trgm) — "harissa chicken". Exact-ish name and ingredient
 *    matching, including typo tolerance. Note the previous search only looked
 *    at title and description, so an ingredient query never matched.
 *  - **semantic** (local embeddings) — "something warming for a cold night".
 *    Handles intent that shares no words with the recipe.
 *
 * Fused with Reciprocal Rank Fusion, which combines rankings without needing
 * the three scores to be on comparable scales.
 *
 * Allergens are a hard filter, not a ranking penalty — the profile treats a
 * severe allergy as "block these recipes outright".
 */

export interface RetrievalOptions {
  query?: string;
  /** Pantry item names, used for the overlap signal. */
  pantry?: string[];
  /** Blocking filter — any recipe mentioning these is removed entirely. */
  allergies?: string[];
  /** Soft preference; recipes carrying these tags are boosted. */
  dietaryRestrictions?: string[];
  limit?: number;
}

export interface RetrievedRecipe {
  id: string;
  title: string;
  imageUrl: string | null;
  cuisine: string | null;
  totalTime: number;
  servings: number;
  dietaryTags: string[];
  matched: string[];
  missing: string[];
  coverage: number;
  score: number;
  /** Which signals put this recipe here — useful in logs and for explaining. */
  reasons: string[];
}

interface IndexedRecipe {
  id: string;
  title: string;
  imageUrl: string | null;
  cuisine: string | null;
  totalTime: number;
  servings: number;
  dietaryTags: string[];
  ingredients: string[];
  ingredientTokens: Set<string>;
  vector: number[] | null;
}

/** RRF constant. 60 is the value from the original paper and behaves well. */
const RRF_K = 60;
const WEIGHTS = { pantry: 1.0, lexical: 0.8, semantic: 0.6 };
const INDEX_TTL_MS = 5 * 60 * 1000;

/** Strip plurals and packaging words so "Chicken Thighs" matches "chicken thigh". */
function normalise(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .map(w => (w.endsWith('es') ? w.slice(0, -2) : w.endsWith('s') ? w.slice(0, -1) : w))
    .filter(w => !STOP.has(w));
}

const STOP = new Set([
  'the', 'and', 'for', 'with', 'into', 'fresh', 'chopped', 'sliced', 'diced',
  'large', 'small', 'medium', 'finely', 'roughly', 'free', 'range', 'plain',
]);

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
const ALLERGEN_TERMS: Record<string, string[]> = {
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
const MEAT_TERMS = [
  'beef', 'steak', 'mince', 'brisket', 'veal', 'lamb', 'mutton', 'venison',
  'goat', 'oxtail', 'liver', 'kidney', 'tripe', 'suet', 'gelatin', 'gelatine',
  'meatball', 'burger', 'sausage', 'bolognese', 'stock cube', 'beef stock',
];

const POULTRY_TERMS = [
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
function expandDiet(raw: string): string[] {
  const key = raw.toLowerCase().trim().replace(/\s+/g, '-');
  for (const [diet, list] of Object.entries(DIET_EXCLUSIONS)) {
    if (key.includes(diet) || key.includes(diet.replace('-', ''))) return list;
  }
  // An unrecognised restriction excludes nothing — better to show the user
  // recipes and let the model reason about them than to return an empty list.
  return [];
}

/** Map a user's free-text allergy onto the terms that appear in recipes. */
function expandAllergen(raw: string): string[] {
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

export class RetrievalService {
  private index: IndexedRecipe[] | null = null;
  private indexedAt = 0;

  /** Drop the cache — call after an import or a new recipe is persisted. */
  invalidate() {
    this.index = null;
  }

  private async getIndex(): Promise<IndexedRecipe[]> {
    if (this.index && Date.now() - this.indexedAt < INDEX_TTL_MS) return this.index;

    const rows = await prisma.recipe.findMany({
      where: { isPublic: true },
      select: {
        id: true,
        title: true,
        imageUrl: true,
        cuisine: true,
        totalTime: true,
        servings: true,
        dietaryTags: true,
        ingredients: { select: { name: true }, orderBy: { order: 'asc' } },
        embedding: { select: { vector: true, model: true } },
      },
    });

    this.index = rows.map(r => {
      const ingredients = r.ingredients.map(i => i.name);
      const tokens = new Set<string>();
      for (const name of ingredients) for (const t of normalise(name)) tokens.add(t);
      return {
        id: r.id,
        title: r.title,
        imageUrl: r.imageUrl,
        cuisine: r.cuisine,
        totalTime: r.totalTime,
        servings: r.servings,
        dietaryTags: r.dietaryTags,
        ingredients,
        ingredientTokens: tokens,
        // Guard against stale vectors from a previous model.
        vector: r.embedding?.model === MODEL_ID ? r.embedding.vector : null,
      };
    });
    this.indexedAt = Date.now();

    const withVectors = this.index.filter(r => r.vector).length;
    logger.info(`Retrieval index built: ${this.index.length} recipes, ${withVectors} embedded`);
    return this.index;
  }

  async search(opts: RetrievalOptions): Promise<RetrievedRecipe[]> {
    const { query, pantry = [], allergies = [], dietaryRestrictions = [], limit = 6 } = opts;
    const index = await this.getIndex();

    // Hard allergen filter first, so nothing downstream can rank a blocked
    // recipe back into the results. Matches on the recipe title too — "Seafood
    // rice" declares itself in the name even when the ingredient list only says
    // "Frozen Seafood mix".
    const blockedTokens = new Set([
      ...allergies.flatMap(expandAllergen),
      ...dietaryRestrictions.flatMap(expandDiet),
    ]);
    let safe = blockedTokens.size
      ? index.filter(r => {
          for (const t of r.ingredientTokens) if (blockedTokens.has(t)) return false;
          for (const t of normalise(r.title)) if (blockedTokens.has(t)) return false;
          return true;
        })
      : index;

    if (blockedTokens.size) {
      logger.info(
        `Diet/allergen filter removed ${index.length - safe.length} of ${index.length} recipes`
      );
    }

    // If the restrictions eliminate everything, fall back to allergens alone.
    // An allergy is a safety constraint and is never relaxed; a diet is a
    // preference, and showing nothing at all is worse than showing the user
    // something they can decline.
    if (!safe.length && dietaryRestrictions.length) {
      const allergenOnly = new Set(allergies.flatMap(expandAllergen));
      safe = allergenOnly.size
        ? index.filter(r => {
            for (const t of r.ingredientTokens) if (allergenOnly.has(t)) return false;
            for (const t of normalise(r.title)) if (allergenOnly.has(t)) return false;
            return true;
          })
        : index;
      logger.warn('Dietary filter emptied the index; falling back to allergen-only filtering');
    }

    const pantryTokens = new Set(pantry.flatMap(normalise));

    /* --- signal 1: pantry coverage ------------------------------------- */
    const coverage = new Map<string, number>();
    for (const r of safe) {
      if (!r.ingredientTokens.size || !pantryTokens.size) {
        coverage.set(r.id, 0);
        continue;
      }
      let hits = 0;
      for (const t of r.ingredientTokens) if (pantryTokens.has(t)) hits++;
      coverage.set(r.id, hits / r.ingredientTokens.size);
    }
    const pantryRank = rank(safe, r => coverage.get(r.id) ?? 0);

    /* --- signal 2: lexical --------------------------------------------- */
    const qTokens = query ? normalise(query) : [];
    const lexicalScore = (r: IndexedRecipe) => {
      if (!qTokens.length) return 0;
      const title = r.title.toLowerCase();
      let s = 0;
      for (const t of qTokens) {
        if (title.includes(t)) s += 2;
        if (r.ingredientTokens.has(t)) s += 1;
        if (r.cuisine && r.cuisine.toLowerCase().includes(t)) s += 0.5;
      }
      return s / (qTokens.length * 3);
    };
    const lexicalRank = rank(safe, lexicalScore);

    /* --- signal 3: semantic -------------------------------------------- */
    let semanticRank = new Map<string, number>();
    if (query) {
      try {
        const qVec = await embed(query);
        semanticRank = rank(safe, r => (r.vector ? cosine(qVec, r.vector) : 0));
      } catch (err) {
        // Retrieval degrades to lexical + pantry rather than failing the chat.
        logger.warn('Semantic retrieval unavailable, falling back', err);
      }
    }

    /* --- fuse ----------------------------------------------------------- */
    const fused = safe.map(r => {
      const reasons: string[] = [];
      let score = 0;

      const p = pantryRank.get(r.id);
      if (p !== undefined && (coverage.get(r.id) ?? 0) > 0) {
        score += WEIGHTS.pantry / (RRF_K + p);
        reasons.push('pantry');
      }
      const l = lexicalRank.get(r.id);
      if (l !== undefined && lexicalScore(r) > 0) {
        score += WEIGHTS.lexical / (RRF_K + l);
        reasons.push('lexical');
      }
      const s = semanticRank.get(r.id);
      if (s !== undefined && s < 50) {
        score += WEIGHTS.semantic / (RRF_K + s);
        reasons.push('semantic');
      }

      // Dietary tags are a nudge, not a filter — the tag vocabulary upstream is
      // inconsistent, so absence is not proof a recipe is unsuitable.
      if (dietaryRestrictions.some(d => r.dietaryTags.some(t => t.toLowerCase() === d.toLowerCase()))) {
        score *= 1.15;
        reasons.push('diet');
      }

      const matched = r.ingredients.filter(n => normalise(n).some(t => pantryTokens.has(t)));
      const missing = r.ingredients.filter(n => !normalise(n).some(t => pantryTokens.has(t)));

      return {
        id: r.id,
        title: r.title,
        imageUrl: r.imageUrl,
        cuisine: r.cuisine,
        totalTime: r.totalTime,
        servings: r.servings,
        dietaryTags: r.dietaryTags,
        matched,
        missing,
        coverage: coverage.get(r.id) ?? 0,
        score,
        reasons,
      };
    });

    return fused
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

/** Rank descending by `scoreOf`; returns recipeId -> 0-based rank. */
function rank(items: IndexedRecipe[], scoreOf: (r: IndexedRecipe) => number): Map<string, number> {
  const scored = items
    .map(r => ({ id: r.id, s: scoreOf(r) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s);
  const out = new Map<string, number>();
  scored.forEach((x, i) => out.set(x.id, i));
  return out;
}

export const retrievalService = new RetrievalService();
