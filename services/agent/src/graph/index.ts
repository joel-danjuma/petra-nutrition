import { END, START, StateGraph } from '@langchain/langgraph';

import { logger } from '../utils/logger';
import { checkpointer } from './checkpointer';
import { clarify } from './nodes/clarify';
import { MAX_ATTEMPTS, composeRecipe } from './nodes/compose-recipe';
import { nutrition } from './nodes/nutrition';
import { respond } from './nodes/respond';
import { router } from './nodes/router';
import { search } from './nodes/search';
import { GraphState, type GraphStateType } from './state';

/**
 * The graph.
 *
 *                    ┌──────────────► clarify ──► END
 *                    │  (materially forks the dish)
 *   START ──► router ┼──────────────► respond ──► END
 *                    │  (chat)
 *                    └──► search ─┬► respond ──► END
 *                                 │  (a library recipe genuinely fits)
 *                                 ├► compose ─┬► nutrition ──► respond ──► END
 *                                 │           └► compose  (one retry)
 *                                 └► nutrition ──► respond
 *                                    (macros for a library dish)
 *
 * The edge that matters is `search → compose`. Retrieval that misses used to be
 * the end of the road: the reply recommended whatever ranked first, or said
 * nothing useful. Now a shortlist that doesn't fit becomes the *seed* for a
 * dish that does, which is the same path the merge case takes — same
 * constraints, same validator, different starting point.
 *
 * Every node either produces an answer or hands the turn somewhere that will.
 * There is no path from START that reaches END without `response` being set,
 * which is what lets the orchestrator treat a null response as a bug rather
 * than as an empty reply to render.
 */

type NodeName =
  | 'router'
  | 'search'
  | 'compose_recipe'
  | 'nutrition'
  | 'respond'
  | 'clarify';

/** Where the turn goes once the router has read the message. */
export function afterRouter(state: GraphStateType): NodeName {
  if (state.clarification) return 'clarify';
  // Chat is the only intent that needs no recipe machinery at all — storage
  // advice, technique, substitutions. Sending it through retrieval adds a
  // database round trip and a shortlist the reply then has to ignore.
  if (state.intent === 'chat') return 'respond';
  return 'search';
}

/** Where the turn goes once retrieval has run. */
export function afterSearch(state: GraphStateType): NodeName {
  // A recipe the user asked about by name, or macros for one: the dish is
  // already decided, so there is nothing to compose.
  if (state.intent === 'nutrition') return 'nutrition';

  // A `search` turn whose shortlist actually answers the question is done
  // retrieving — recommending a real recipe beats composing one, because a
  // library recipe can be opened, cooked hands-free and added to a plan.
  if (state.intent === 'search' && state.retrievalSufficient) return 'respond';

  return 'compose_recipe';
}

/** Where the turn goes once compose has had a go. */
export function afterCompose(state: GraphStateType): NodeName {
  if (state.draft) return 'nutrition';

  // One bounded retry, with the specific violations fed back. A loop that
  // keeps going until it passes turns a 3-second turn into a 30-second one and
  // spends a daily token budget on a model that has already shown it can't
  // satisfy the constraint.
  if (state.composeAttempts < MAX_ATTEMPTS) return 'compose_recipe';

  // Degrade rather than fail: `respond` is briefed that there is no recipe and
  // states the compromise plainly.
  return 'respond';
}

const build = () =>
  new StateGraph(GraphState)
    .addNode('router', router)
    .addNode('search', search)
    .addNode('compose_recipe', composeRecipe)
    .addNode('nutrition', nutrition)
    .addNode('respond', respond)
    .addNode('clarify', clarify)
    .addEdge(START, 'router')
    .addConditionalEdges('router', afterRouter, ['clarify', 'respond', 'search'])
    .addConditionalEdges('search', afterSearch, ['nutrition', 'compose_recipe', 'respond'])
    .addConditionalEdges('compose_recipe', afterCompose, [
      'nutrition',
      'compose_recipe',
      'respond',
    ])
    .addEdge('nutrition', 'respond')
    .addEdge('respond', END)
    .addEdge('clarify', END);

let compiled: ReturnType<ReturnType<typeof build>['compile']> | null = null;

/**
 * The compiled graph, built once.
 *
 * Compilation validates the topology, so doing it per request would pay that
 * cost on every turn and, worse, would only surface a wiring error on the
 * unlucky request that hit the broken branch. Built lazily rather than at
 * module load so importing a node in a test does not require a checkpointer.
 */
export function chatGraph() {
  if (!compiled) {
    compiled = build().compile({ checkpointer: checkpointer() });
    logger.info('Chat graph compiled');
  }
  return compiled;
}

/** Test seam: drop the compiled graph so a new checkpointer takes effect. */
export function resetGraph(): void {
  compiled = null;
}

/**
 * The recursion ceiling.
 *
 * The longest legitimate path is router → search → compose → compose →
 * nutrition → respond, which is six steps. Twelve leaves room for a future
 * branch without leaving room for a runaway loop: hitting this limit should
 * mean a bug in an edge function, and a low ceiling is how that gets found in
 * a test rather than in a bill.
 */
export const RECURSION_LIMIT = 12;

export { GraphState } from './state';
export type { GraphStateType } from './state';
