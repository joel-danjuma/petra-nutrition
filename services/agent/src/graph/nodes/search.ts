import { retrievalService, type RetrievedRecipe } from '../../retrieval';
import { overflowSeeds } from '../../retrieval/overflow';
import { normalise } from '../../retrieval/terms';
import { logger } from '../../utils/logger';
import { emitNode } from '../turn-context';
import type { GraphStateType, GraphUpdate } from '../state';

/**
 * Grounded recommendation over the recipe corpus.
 *
 * Behaviourally unchanged from `retrieveForTurn` — same `RetrievalService`,
 * same signals, same never-fail-the-chat posture — with one addition that is
 * the whole reason it is a node rather than a function call: it decides whether
 * what it found actually answers the question, and that decision is an edge in
 * the graph.
 *
 * When the answer is no, the turn continues to `compose_recipe` with these
 * hits as a seed rather than stopping at "here is the nearest thing I have".
 * The old orchestrator had no such edge, which is why "create a recipe with
 * chicken breasts, linguine and bell peppers" returned whatever the index
 * happened to rank first.
 */

/**
 * Does this recipe actually use everything the user named?
 *
 * Deliberately strict. A user who lists three ingredients is describing the
 * dish they want, and a recipe using two of the three is a different dish. The
 * cost of being wrong in this direction is composing something when a library
 * recipe would have done; the cost of the other direction is the failing case.
 */
function coversNamed(recipe: RetrievedRecipe, named: string[]): boolean {
  if (!named.length) return true;

  const haystack = new Set<string>([
    ...recipe.matched.flatMap(normalise),
    ...recipe.missing.flatMap(normalise),
    ...normalise(recipe.title),
  ]);

  return named.every(name => {
    const tokens = normalise(name);
    return tokens.length > 0 && tokens.some(t => haystack.has(t));
  });
}

/**
 * Is this recipe cookable from what the user actually has?
 *
 * Only asked of a pantry-led question — "what should I make for dinner?" with a
 * stocked pantry and no ingredients named. For that question a shortlist of
 * recipes missing seven ingredients each is not an answer, and saying so was
 * left to the model: it correctly replied that none of them fit, which read as
 * a refusal with a recipe card stapled to it. Deciding here instead sends the
 * turn on to compose, which writes something from what is actually in.
 *
 * Either half is enough. High coverage means most of the dish is already in;
 * a short missing list means the shop is one or two items, which people do.
 */
const MIN_PANTRY_COVERAGE = 0.5;
const MAX_MISSING_ITEMS = 2;

function cookableFromPantry(recipe: RetrievedRecipe): boolean {
  return recipe.coverage >= MIN_PANTRY_COVERAGE || recipe.missing.length <= MAX_MISSING_ITEMS;
}

export async function search(state: GraphStateType): Promise<GraphUpdate> {
  emitNode('search');

  const { userMessage, context, namedIngredients, options, userId } = state;
  if (!userMessage) return { retrieved: [], retrievalSufficient: false, overflow: [] };

  const pantry = context?.pantryNames?.length
    ? context.pantryNames
    : (context?.currentPantryItems ?? []);

  try {
    const hits = await retrievalService.search({
      query: userMessage,
      // When the user named ingredients, those are what coverage should be
      // measured against — they asked for a dish built from *these*, not from
      // whatever else is in the cupboard.
      pantry: namedIngredients.length ? namedIngredients : pantry,
      allergies: context?.allergies ?? [],
      dietaryRestrictions: context?.dietaryRestrictions ?? [],
      limit: options?.maxRetrieved ?? 6,
      // Their own saved generations are searchable too, or saving one is a
      // write nobody can ever read back.
      ...(userId ? { ownerId: userId } : {}),
    });

    // A stated time limit is a hard constraint, not a preference: handing back
    // a recipe of unknown length to someone who asked for thirty minutes is not
    // an answer. `totalTime` of 0 means the import carried no timings, which is
    // unknown rather than instant — the same reading the recipe card applies —
    // so an untimed recipe cannot satisfy a time limit.
    const withinTime = (h: RetrievedRecipe) =>
      state.maxMinutes === null || (h.totalTime > 0 && h.totalTime <= state.maxMinutes);

    // Coverage only means something when the pantry is what the question was
    // about. A named dish is asked for on its own terms, and a user with no
    // pantry recorded — every free account — would otherwise never be shown a
    // library recipe at all.
    const pantryLed = !namedIngredients.length && pantry.length > 0;

    const fitting = hits.filter(
      h =>
        coversNamed(h, namedIngredients) &&
        withinTime(h) &&
        (!pantryLed || cookableFromPantry(h))
    );
    const sufficient = fitting.length > 0;

    // When the limit is the only thing that ruled everything out, the turn goes
    // on to compose a dish that does have real timings — and the reply says so
    // rather than quietly ignoring what was asked.
    const timedOut =
      !sufficient &&
      state.maxMinutes !== null &&
      hits.some(h => coversNamed(h, namedIngredients));

    // Only when the local corpus came up thin, and only as compose seeds. An
    // external hit has no row, so it can be an idea but never a recommendation.
    const overflow = sufficient || hits.length >= 3 ? [] : await overflowSeeds(userMessage);

    logger.info('Retrieval for graph turn', {
      intent: state.intent,
      hits: hits.length,
      fitting: fitting.length,
      overflow: overflow.length,
      sufficient,
      ...(state.maxMinutes !== null ? { maxMinutes: state.maxMinutes, timedOut } : {}),
    });

    return {
      // Only the shortlist that actually fits is worth grounding on: handing
      // the prompt a recipe the filter just rejected invites it back into the
      // reply.
      retrieved: sufficient ? fitting : hits,
      retrievalSufficient: sufficient,
      overflow,
      ...(timedOut
        ? {
            compromises: [
              `Nothing in your library is recorded as taking ${state.maxMinutes} minutes or less, ` +
                `so this one is written to fit rather than picked from the shelf.`,
            ],
          }
        : {}),
    };
  } catch (error) {
    // Unchanged policy, now expressed as a graph-level one: an ungrounded
    // reply is worse than a grounded one and far better than an error. The
    // difference is that the graph has somewhere to go from here — a failed
    // retrieval falls through to compose rather than to an empty shortlist.
    logger.warn('Recipe retrieval failed; continuing ungrounded', error);
    return { retrieved: [], retrievalSufficient: false, overflow: [] };
  }
}
