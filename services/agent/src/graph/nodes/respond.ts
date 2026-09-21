import type { ChatResponse } from '@petra/agent-contract';

import { buildSystemPrompt, parseResponse } from '../../llm/chat-prompt';
import { modelFor } from '../../llm/provider';
import { stripMarkdown, streamSafePrefix } from '../../llm/strip-markdown';
import type { ChatContext, RetrievedRecipeContext } from '../../llm/types';
import { logger } from '../../utils/logger';
import type { GraphStateType, GraphUpdate } from '../state';
import { emitChunk, turnContext, turnSignal } from '../turn-context';

/**
 * The prose the user reads, and the envelope the gateway persists.
 *
 * Streaming is the reason this is the last node rather than a formatting step:
 * the reader should see words as they arrive, and every node before this one is
 * silent work that only earns its latency because `node` progress frames say
 * what it is doing.
 *
 * What gets streamed is sanitised, not raw. `streamSafePrefix` withholds the
 * tail of any construct still open — an unclosed emphasis run, a half-arrived
 * `[recipe:<id>]` marker — so the reader never watches asterisks appear and
 * then fail to disappear. The resolved response is authoritative; a client
 * should replace whatever it accumulated with `content` when the stream ends,
 * which makes any streaming imperfection self-correcting.
 */

/** Translate the wire context into the shape the prompt builder expects. */
function toChatContext(state: GraphStateType): ChatContext {
  const { context } = state;

  // A composed dish is not a shortlist to choose from, so the grounding rules
  // must not fire: telling the model to "recommend ONE of the recipes listed
  // above" while handing it a recipe we just wrote produces a reply that
  // recommends a library dish and ignores the draft entirely.
  const retrievedRecipes: RetrievedRecipeContext[] = state.draft
    ? []
    : state.retrieved.map(r => ({
        id: r.id,
        title: r.title,
        cuisine: r.cuisine,
        totalTime: r.totalTime,
        matched: r.matched,
        missing: r.missing,
      }));

  return {
    userPreferences: context?.userPreferences,
    currentPantryItems: context?.currentPantryItems ?? [],
    dietaryRestrictions: context?.dietaryRestrictions ?? [],
    healthGoals: context?.healthGoals ?? [],
    allergies: context?.allergies ?? [],
    activeMealPlan: context?.activeMealPlan,
    lastRecipeSearch: context?.lastRecipeSearch,
    retrievedRecipes,
  };
}

/**
 * What this turn produced, described to the model that has to write about it.
 *
 * The draft is summarised rather than pasted: the recipe card carries the
 * ingredients and the method, and a reply that repeats them is two screens of
 * duplicate text on a phone. What the prose is for is why this dish, what the
 * reader already has, and what the agent decided on their behalf.
 */
function turnBriefing(state: GraphStateType): string {
  const parts: string[] = [];

  if (state.draft) {
    const recipe = state.draft;
    parts.push(
      `YOU HAVE JUST WRITTEN THIS DISH FOR THEM. It is shown beside your reply as a card, so do not repeat the ingredients or the method.

Title: ${recipe.title}
Serves: ${recipe.servings}
Time: ${recipe.prepTime} min prep, ${recipe.cookTime} min cook
Built around: ${recipe.ingredients.filter(i => !i.staple).map(i => i.name).join(', ')}
EVERY ingredient in it: ${recipe.ingredients.map(i => i.name).join(', ')}

Name NOTHING that is not on that list. Reaching for a flourish the recipe does
not contain — "finished with a little lemon zest" when there is no lemon — reads
as an instruction, and the reader finds out it was decoration when they check
the card.

Write 2-3 short paragraphs: what this dish is, why it works with what they
have, and the one thing that will make or break it. Speak about it as something
you have made for them, not as a suggestion to consider.

DO NOT REFUSE AND DO NOT APOLOGISE. The recipe above exists and they can cook
it tonight. If they asked for something you could not use — an allergen, or an
ingredient they do not have — say in ONE opening sentence what you did instead,
then get on with describing the dish you made. Leading with "I'm sorry, I can't
help with that" above a recipe card they can cook from is the worst possible
reply: it is both unhelpful and untrue.`
    );
  }

  if (state.macros) {
    const n = state.macros.perServing;
    parts.push(
      `MACROS PER SERVING (computed from a nutrition database, not estimated): ` +
        `${n.calories} kcal, ${n.protein}g protein, ${n.carbs}g carbs, ${n.fat}g fat. ` +
        `Confidence: ${state.macros.confidence}. ` +
        `Mention these in one sentence at most — they are also shown as a panel. ` +
        (state.context?.healthGoals?.length
          ? `Their goals are ${state.context.healthGoals.join(', ')}; note how this fits ` +
            `only if it genuinely does, as a remark and never as a warning or a refusal.`
          : '')
    );
  }

  if (state.assumptions.length) {
    parts.push(
      `YOU ASSUMED THESE. Work the ones that matter into your reply plainly, as ` +
        `a statement rather than an apology:\n${state.assumptions.map(a => `- ${a}`).join('\n')}`
    );
  }

  if (state.compromises.length) {
    parts.push(
      `THESE DID NOT FULLY WORK OUT. Say so plainly, in one sentence, without ` +
        `over-explaining:\n${state.compromises.map(c => `- ${c}`).join('\n')}`
    );
  }

  // Any food-finding turn that has nothing to show. Gating this on `compose`
  // alone left the commonest case unguarded: a `search` turn that retrieved
  // nothing and then failed to compose reached the model with no candidates,
  // no draft and no warning, so it invented a dish in prose — which is what the
  // user saw. `chat` is deliberately excluded: a question about storing basil
  // legitimately has neither a draft nor candidates.
  const foodTurn = state.intent === 'compose' || state.intent === 'search';

  if (foodTurn && !state.draft && !state.retrieved.length) {
    parts.push(
      `YOU HAVE NO RECIPE TO OFFER THIS TIME. Say that directly in one sentence, ` +
        `say what got in the way if you know, and offer the nearest useful thing — ` +
        `a technique, or what one extra ingredient would unlock. Do not invent a ` +
        `recipe in prose as a substitute; there is no card behind it and nothing ` +
        `they could cook from it.`
    );
  }

  return parts.join('\n\n');
}

export async function respond(state: GraphStateType): Promise<GraphUpdate> {
  // Deliberately no `emitNode('respond')`: the first text chunk is a better
  // signal than a label telling the reader that words are coming.
  const context = toChatContext(state);
  const briefing = turnBriefing(state);

  const messages = [
    // Terse: a chat turn is read beside a card that already carries the
    // timings, ingredients and macros. The single-shot endpoints keep the
    // standard length.
    { role: 'system' as const, content: buildSystemPrompt(context, { brevity: 'terse' }) },
    ...state.messages,
    ...(briefing ? [{ role: 'system' as const, content: briefing }] : []),
  ];

  const streaming = !!turnContext().onChunk;
  const model = modelFor('respond');
  const signal = turnSignal();

  try {
    let raw = '';
    let emitted = '';

    const result = streaming
      ? await model.stream(
          messages,
          delta => {
            raw += delta;
            const safe = stripMarkdown(streamSafePrefix(raw));
            if (safe.length > emitted.length && safe.startsWith(emitted)) {
              emitChunk(safe.slice(emitted.length));
              emitted = safe;
            }
          },
          { signal }
        )
      : await model.complete(messages, { signal });

    const parsed = parseResponse(result.text, context.retrievedRecipes);

    // Release whatever the safety margin was still holding back.
    if (streaming && parsed.content.startsWith(emitted) && parsed.content.length > emitted.length) {
      emitChunk(parsed.content.slice(emitted.length));
    }

    // A grounded turn that named no recipe the parser could resolve is the bug
    // the user reported: prose about a dish with nothing to tap. The model was
    // handed a best-first shortlist and told to pick one of them, so falling
    // back to the top of that list is the honest reading of what it was
    // answering. Logged at warn, because a high rate here means the prompt or
    // the matcher needs work rather than this backstop.
    const shortlist = context.retrievedRecipes ?? [];

    if (!parsed.recipeId && !state.draft && state.retrievalSufficient && shortlist.length) {
      parsed.recipeId = shortlist[0].id;
      parsed.type = 'recipe_suggestion';
      logger.warn('Attached the top candidate; the reply named none of them', {
        intent: state.intent,
        candidates: shortlist.length,
        recipeId: parsed.recipeId,
      });
    }

    const response: ChatResponse = {
      ...parsed,
      // A composed dish is its own response type: there is no `recipeId` to
      // open, because the payload *is* the recipe until the user saves it.
      type: state.draft ? 'generated_recipe' : parsed.type,
      ...(state.draft ? { generatedRecipe: state.draft, recipeId: undefined } : {}),
      ...(state.macros ? { nutrition: state.macros } : {}),
      assumptions: state.assumptions,
      compromises: state.compromises,
      model: result.model,
      tokensUsed: (result.tokensUsed ?? 0) + state.tokensUsed,
    };

    logger.info('Graph turn responded', {
      intent: state.intent,
      type: response.type,
      generated: !!state.draft,
      hasMacros: !!state.macros,
      recipeId: response.recipeId,
    });

    return { model: result.model, tokensUsed: result.tokensUsed ?? 0, response };
  } catch (error) {
    logger.error('Respond node failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
