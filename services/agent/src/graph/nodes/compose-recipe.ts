import type { GeneratedRecipe } from '@petra/agent-contract';

import { parseJson } from '../../llm/enrich';
import { modelFor } from '../../llm/provider';
import { logger } from '../../utils/logger';
import { STAPLES, type Constraints } from '../constraints';
import { constraintsFor, type GraphStateType, type GraphUpdate } from '../state';
import { emitNode, turnSignal } from '../turn-context';
import { feedbackFor, validateGeneratedRecipe } from '../validate';

/**
 * Compose a dish, or fuse several that partly fit.
 *
 * This is the capability the system did not have. `runChatTurn` retrieved,
 * grounded and replied; when retrieval missed there was no path that built
 * something. A competent cook handed chicken breasts, linguine and bell
 * peppers gets there without thinking — dice the chicken, slice the peppers,
 * build a sauce with the starchy pasta water, season. This node is that, under
 * constraints, with the output checked rather than trusted.
 *
 * Merge is a *mode*, not a fourth node. When search found recipes that partly
 * fit, they seed the draft instead of a blank page; the constraints, the
 * prompt and the validator are the same either way. A merged dish presents as
 * one dish, with the seeds recorded in `inspiredBy` for the quiet "inspired
 * by" line — not as an attribution block, because the user asked for dinner
 * rather than a bibliography.
 *
 * The allowed ingredient set is stated in the prompt *and* enforced in code.
 * The prompt is how the model finds out; `validate.ts` is how we find out.
 */

const MAX_ATTEMPTS = 2;

/**
 * The instruction that does the work.
 *
 * Two things in here are load-bearing and easy to lose in an edit:
 *
 *  - The available list is exhaustive and stated as a closed set. Softening it
 *    to "prefer these" produces a recipe with double cream in it, which is a
 *    shopping list wearing a recipe's clothes.
 *  - Amounts are mandatory on every line. Without them the nutrition node has
 *    nothing to compute from, and macros are half the point of composing at
 *    all.
 */
const PROMPT = `You are a working cook writing a recipe someone will cook tonight. Reply with ONE JSON object and nothing else — no prose, no markdown fence.

{
  "title": "<what the dish is called. Plain and appetising, not clever.>",
  "description": "<one sentence on what eating this is like>",
  "cuisine": "<cuisine, or null>",
  "servings": <int>,
  "prepTime": <int minutes>,
  "cookTime": <int minutes>,
  "difficulty": "EASY" | "MEDIUM" | "HARD",
  "ingredients": [ { "name": "<ingredient>", "amount": <number>, "unit": "<g|ml|tbsp|tsp|clove|whole|...>", "notes": "<prep detail, optional>" } ],
  "instructions": [ { "step": <int from 1>, "instruction": "<what to do, in order>", "duration": <int minutes, optional>, "tip": "<technique note, optional>" } ],
  "safetyNote": "<the food-safety thing that actually matters here — probe temperature, raw protein handling. Skip generic advice.>",
  "zeroWasteNote": "<how to use the whole ingredient, and what to do with leftovers tomorrow. Specific to THIS dish.>"
}

HARD RULES — a recipe that breaks any of these is rejected outright:
1. Use ONLY ingredients from the AVAILABLE list below. Not "mostly" — only. If the dish would be better with something not on the list, cook a different dish.
2. Every ingredient needs a real amount and unit. No "to taste" as the only quantity.
3. Every ingredient you list must be used in a step, and every step must only call for ingredients you listed.
4. Steps are ordered and specific: heat what, to what, for how long, until what. A cook should not have to guess.
5. Never use anything from the EXCLUDED list, in any form, in any step. There is no acceptable substitute — cook without it.

Write plainly. No exclamation marks.`;

/** The available/excluded block. Built from data, so it cannot drift. */
export function constraintBlock(constraints: Constraints, servings: number | null): string {
  const named = constraints.named.filter(
    n => !STAPLES.some(s => s.toLowerCase() === n.toLowerCase())
  );
  const pantry = constraints.pantry.filter(
    p =>
      !named.some(n => n.toLowerCase() === p.toLowerCase()) &&
      constraints.allowed.some(a => a.toLowerCase() === p.toLowerCase())
  );

  const lines: string[] = [];

  if (named.length) {
    lines.push(
      `THE USER NAMED THESE — the dish must be built around them, all of them:`,
      named.map(n => `  - ${n}`).join('\n')
    );
  }
  if (pantry.length) {
    lines.push(
      `ALSO IN THEIR KITCHEN (use if it helps, ignore if not):`,
      pantry.slice(0, 40).map(p => `  - ${p}`).join('\n')
    );
  }
  lines.push(
    `STAPLES (assume they have these, never list them as something to buy):`,
    `  ${STAPLES.filter(s => constraints.allowed.includes(s)).join(', ')}`
  );

  lines.push(
    `AVAILABLE = the three groups above and nothing else.`
  );

  if (constraints.blockedTokens.size) {
    const declared = [...constraints.allergies, ...constraints.dietaryRestrictions];
    lines.push(
      `EXCLUDED — ${declared.join('; ')}. Never use, in any form or any step:`,
      `  ${[...constraints.blockedTokens].sort().join(', ')}`
    );
  }

  lines.push(
    servings
      ? `SERVINGS: ${servings}.`
      : `SERVINGS: choose what the quantities on hand actually make, and do not pad it.`
  );

  return lines.join('\n\n');
}

/** The merge seed: recipes that partly fit, offered as a starting point. */
function seedBlock(state: GraphStateType): string {
  const lines = [
    ...state.retrieved.slice(0, 3).map(r => {
      const bits = [`- "${r.title}"`];
      if (r.cuisine) bits.push(`(${r.cuisine})`);
      if (r.matched.length) bits.push(`uses: ${r.matched.slice(0, 8).join(', ')}`);
      return bits.join(' ');
    }),
    // Ideas from outside the corpus, when it came up thin. Indistinguishable
    // from a local seed at this point, and deliberately so — the node's job is
    // to write one dish, not to weigh provenance. Where they differ is
    // downstream: only local seeds reach `inspiredBy`, because only they have
    // an id the client can open.
    ...state.overflow.slice(0, 3).map(r => {
      const bits = [`- "${r.title}"`];
      if (r.cuisine) bits.push(`(${r.cuisine})`);
      if (r.ingredients.length) bits.push(`uses: ${r.ingredients.slice(0, 8).join(', ')}`);
      return bits.join(' ');
    }),
  ];

  if (!lines.length) return '';

  return `
THESE RECIPES PARTLY FIT. Take what is useful — a technique, a flavour
direction, a sequence — and write ONE dish. Do not describe them, do not offer
a choice between them, and do not pull in their ingredients unless those
ingredients are on the AVAILABLE list.
${lines.join('\n')}`;
}

export async function composeRecipe(state: GraphStateType): Promise<GraphUpdate> {
  emitNode('compose_recipe');

  const constraints = constraintsFor(state);
  const attempt = state.composeAttempts + 1;

  // The retry is not a re-ask: the model is told exactly what was wrong with
  // its own previous answer. A bare "try again" produces the same output, which
  // is a wasted call and a slower turn for nothing.
  const retryBlock =
    state.failures.length && state.draft === null
      ? `
YOUR PREVIOUS ATTEMPT WAS REJECTED. Fix exactly these and return the whole
recipe again:
${feedbackFor(state.failures)}`
      : '';

  const userMessage = [
    `The user said: "${state.userMessage}"`,
    constraintBlock(constraints, state.servings),
    seedBlock(state),
    retryBlock,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const result = await modelFor('compose').complete(
      [
        { role: 'system', content: PROMPT },
        { role: 'user', content: userMessage },
      ],
      { signal: turnSignal() }
    );

    const validation = validateGeneratedRecipe(parseJson(result.text), constraints);

    if (!validation.ok) {
      logger.warn('Composed recipe rejected', {
        attempt,
        failures: validation.failures.map(f => f.kind),
      });
      return {
        draft: null,
        failures: validation.failures,
        composeAttempts: 1,
        model: result.model,
        tokensUsed: result.tokensUsed ?? 0,
      };
    }

    const recipe: GeneratedRecipe = {
      ...validation.recipe,
      // Recorded here rather than asked of the model: the ids are ours, and a
      // model asked to echo an id will eventually echo one that doesn't exist.
      inspiredBy: state.retrieved.slice(0, 3).map(r => r.id),
    };

    return {
      draft: recipe,
      failures: [],
      composeAttempts: 1,
      model: result.model,
      tokensUsed: result.tokensUsed ?? 0,
      assumptions: assumptionsFor(recipe, state, constraints),
    };
  } catch (error) {
    logger.error('Compose node failed', {
      attempt,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      draft: null,
      failures: [
        {
          kind: 'malformed' as const,
          message: error instanceof Error ? error.message : 'The model call failed.',
        },
      ],
      composeAttempts: 1,
    };
  }
}

/**
 * What the recipe decided on the user's behalf.
 *
 * Every one of these is something a reader would otherwise have to work out by
 * comparing the recipe against their own kitchen, which is exactly the work the
 * app is supposed to do for them.
 */
function assumptionsFor(
  recipe: GeneratedRecipe,
  state: GraphStateType,
  constraints: Constraints
): string[] {
  const out: string[] = [];

  if (state.servings === null) {
    out.push(
      `Scaled to ${recipe.servings} ${recipe.servings === 1 ? 'serving' : 'servings'}, ` +
        `which is what those quantities make.`
    );
  }

  const staplesUsed = recipe.ingredients.filter(i => i.staple).map(i => i.name);
  if (staplesUsed.length) {
    out.push(`Assumed you already have ${staplesUsed.join(', ')}.`);
  }

  if (recipe.inspiredBy.length && state.retrieved.length) {
    out.push(`Inspired by ${state.retrieved[0].title} from your library.`);
  }

  if (constraints.named.length) {
    const unused = constraints.named.filter(
      n => !recipe.ingredients.some(i => i.name.toLowerCase().includes(n.toLowerCase().split(' ')[0]))
    );
    if (unused.length) out.push(`Left out ${unused.join(', ')} — it didn't fit this dish.`);
  }

  return out;
}

export { MAX_ATTEMPTS };
