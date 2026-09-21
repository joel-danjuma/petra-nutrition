import { logger } from '../utils/logger';
import { embed } from './embedding';
import {
  blockedPattern,
  hydrate,
  lexicalCandidates,
  pantryCandidates,
  semanticCandidates,
  verifySearchCapability,
  type Candidate,
  type HydratedRecipe,
} from './sql';
import { expandAllergen, expandDiet, normalise } from './terms';

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
 * severe allergy as "block these recipes outright". The filter is applied
 * inside each candidate query rather than to their results, so a blocked
 * recipe cannot consume a candidate slot and push a safe one out.
 *
 * **Candidate generation moved into the database.** The previous version loaded
 * every public recipe into process memory with token sets and 384-dimension
 * vectors, then scored all of them in JavaScript per query. That is correct at
 * a few hundred recipes and untenable at a million — multiple gigabytes
 * resident per replica and a full scan per chat turn — which is why a bulk
 * import could not land before this changed. Each signal is now a bounded,
 * indexed SQL query; fusion stays here, over three short lists.
 *
 * `search()` keeps its signature, so nothing upstream knows this happened.
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
  /**
   * Also search this caller's own recipes, not just the public corpus.
   *
   * A saved generation is written private, so without this it is embedded and
   * then permanently unfindable.
   */
  ownerId?: string;
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

/** RRF constant. 60 is the value from the original paper and behaves well. */
const RRF_K = 60;
const WEIGHTS = { pantry: 1.0, lexical: 0.8, semantic: 0.6 };

export class RetrievalService {
  /**
   * Whether the database can actually serve a semantic query.
   *
   * Probed once and cached, rather than checked per query: a missing pgvector
   * extension is a deploy-shaped problem, not a per-request one, and running
   * `pg_extension` lookups on every chat turn to rediscover it would be
   * absurd. Null means "not yet probed".
   */
  private capability: Awaited<ReturnType<typeof verifySearchCapability>> | null = null;

  /**
   * Kept for `POST /v1/index/rebuild` and the embed script.
   *
   * There is no longer an in-process index to drop — candidate generation
   * reads the database on every query, so a newly imported recipe is visible
   * immediately. What this does clear is the capability probe, so a deploy
   * that has just run the pgvector migration starts using semantic retrieval
   * without a restart.
   */
  invalidate() {
    this.capability = null;
  }

  private async searchCapability() {
    if (!this.capability) this.capability = await verifySearchCapability();
    return this.capability;
  }

  async search(opts: RetrievalOptions): Promise<RetrievedRecipe[]> {
    const {
      query,
      pantry = [],
      allergies = [],
      dietaryRestrictions = [],
      limit = 6,
      ownerId,
    } = opts;

    const blockedTerms = [
      ...allergies.flatMap(expandAllergen),
      ...dietaryRestrictions.flatMap(expandDiet),
    ];
    let blocked = blockedPattern(blockedTerms);

    let fused = await this.candidates(query, pantry, blocked, ownerId);

    // If the restrictions eliminate everything, fall back to allergens alone.
    // An allergy is a safety constraint and is never relaxed; a diet is a
    // preference, and showing nothing at all is worse than showing the user
    // something they can decline.
    if (!fused.length && dietaryRestrictions.length) {
      blocked = blockedPattern(allergies.flatMap(expandAllergen));
      fused = await this.candidates(query, pantry, blocked, ownerId);
      if (fused.length) {
        logger.warn(
          'Dietary filter returned nothing; falling back to allergen-only filtering'
        );
      }
    }

    if (!fused.length) return [];

    const hydrated = await hydrate(fused.slice(0, limit * 3).map(f => f.id));
    const pantryTokens = new Set(pantry.flatMap(normalise));

    const results: RetrievedRecipe[] = [];
    for (const { id, score, reasons } of fused) {
      const recipe = hydrated.get(id);
      if (!recipe) continue;
      results.push(this.shape(recipe, score, reasons, pantryTokens, dietaryRestrictions));
      if (results.length >= limit) break;
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Run the three signals and fuse them.
   *
   * The queries go out together: they are independent, they hit different
   * indexes, and running them in series would make a chat turn wait for the
   * sum of three latencies instead of the maximum of them.
   *
   * A signal that fails is dropped rather than failing the search. Semantic is
   * the one that actually does fail in practice — the embedding model may not
   * have loaded, or pgvector may not be installed — and retrieval without it is
   * still useful, which is the posture the whole file takes.
   */
  private async candidates(
    query: string | undefined,
    pantry: string[],
    blocked: string | null,
    ownerId?: string
  ): Promise<{ id: string; score: number; reasons: string[] }[]> {
    const capability = await this.searchCapability();

    const [pantryHits, lexicalHits, semanticHits] = await Promise.all([
      pantry.length
        ? pantryCandidates(pantry.flatMap(normalise), blocked, ownerId).catch(error => {
            logger.warn('Pantry-overlap retrieval failed', error);
            return [] as Candidate[];
          })
        : Promise.resolve([] as Candidate[]),

      query && capability.pgTrgm
        ? lexicalCandidates(query, blocked, ownerId).catch(error => {
            logger.warn('Lexical retrieval failed', error);
            return [] as Candidate[];
          })
        : Promise.resolve([] as Candidate[]),

      query && capability.pgvector && capability.embedded > 0
        ? embed(query)
            .then(vector => semanticCandidates(vector, blocked, ownerId))
            .catch(error => {
              // Degrades to lexical + pantry rather than failing the chat.
              logger.warn('Semantic retrieval unavailable, falling back', error);
              return [] as Candidate[];
            })
        : Promise.resolve([] as Candidate[]),
    ]);

    const scores = new Map<string, { score: number; reasons: string[] }>();

    const fuse = (hits: Candidate[], weight: number, reason: string) => {
      for (const { id, rank } of hits) {
        const entry = scores.get(id) ?? { score: 0, reasons: [] };
        entry.score += weight / (RRF_K + rank);
        entry.reasons.push(reason);
        scores.set(id, entry);
      }
    };

    fuse(pantryHits, WEIGHTS.pantry, 'pantry');
    fuse(lexicalHits, WEIGHTS.lexical, 'lexical');
    fuse(semanticHits, WEIGHTS.semantic, 'semantic');

    logger.info('Retrieval candidates', {
      pantry: pantryHits.length,
      lexical: lexicalHits.length,
      semantic: semanticHits.length,
      fused: scores.size,
    });

    return [...scores.entries()]
      .map(([id, entry]) => ({ id, ...entry }))
      .sort((a, b) => b.score - a.score);
  }

  /** Turn a hydrated row plus its fused score into the shape callers expect. */
  private shape(
    recipe: HydratedRecipe,
    score: number,
    reasons: string[],
    pantryTokens: Set<string>,
    dietaryRestrictions: string[]
  ): RetrievedRecipe {
    const matched = recipe.ingredients.filter(n =>
      normalise(n).some(t => pantryTokens.has(t))
    );
    const missing = recipe.ingredients.filter(
      n => !normalise(n).some(t => pantryTokens.has(t))
    );

    // Dietary tags are a nudge, not a filter — the tag vocabulary upstream is
    // inconsistent, so absence is not proof a recipe is unsuitable.
    const tagged = dietaryRestrictions.some(d =>
      recipe.dietaryTags.some(t => t.toLowerCase() === d.toLowerCase())
    );

    return {
      id: recipe.id,
      title: recipe.title,
      imageUrl: recipe.imageUrl,
      cuisine: recipe.cuisine,
      totalTime: recipe.totalTime,
      servings: recipe.servings,
      dietaryTags: recipe.dietaryTags,
      matched,
      missing,
      coverage: recipe.ingredients.length ? matched.length / recipe.ingredients.length : 0,
      score: tagged ? score * 1.15 : score,
      reasons: tagged ? [...reasons, 'diet'] : reasons,
    };
  }
}

export const retrievalService = new RetrievalService();
