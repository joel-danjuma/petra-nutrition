import { Annotation } from '@langchain/langgraph';
import type {
  AgentContext,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  GeneratedRecipe,
  NutritionBreakdown,
} from '@petra/agent-contract';

import type { RetrievedRecipe } from '../retrieval';
import { deriveConstraints, type Constraints } from './constraints';
import type { ValidationFailure } from './validate';

/**
 * The graph's state channels.
 *
 * One rule governs what may live here: **everything must survive JSON**. State
 * is checkpointed to Redis, and a channel holding a `Set`, a `Map` or a
 * function comes back from a resume as `{}` — silently, with no error, and the
 * turn continues on data that is quietly wrong. So the constraint set is *not*
 * a channel: `constraintsFor` derives it from `context` and `namedIngredients`
 * on demand, which costs a few string operations over about forty short names
 * and removes the whole failure mode.
 *
 * Runtime handles (the chunk callback, the abort signal) are not here either —
 * see `turn-context.ts`.
 */

/** What the router decided this turn is. */
export type Intent =
  /** Conversation, storage advice, technique — no recipe machinery needed. */
  | 'chat'
  /** "What can I make with…", "something warming" — recommend from the corpus. */
  | 'search'
  /** "Create a recipe with X, Y, Z" — compose, seeded by search if it helps. */
  | 'compose'
  /** "How many calories in that?" — macros for a specific dish. */
  | 'nutrition';

/** Overwrite-on-write. The default reducer for a channel one node owns. */
const last = <T>(initial: () => T) =>
  Annotation<T>({ reducer: (_current: T, update: T) => update, default: initial });

/**
 * Deduplicated lines the user is told at the end.
 *
 * Overwrite-on-write, not append-only, because state is checkpointed per thread
 * and a thread is a whole chat session: an append-only channel accumulated
 * every assumption ever made in the conversation and re-briefed the lot into
 * every subsequent reply. The two nodes that write these merge with what they
 * were given, so a single turn still collects from more than one node.
 */
const collected = Annotation<string[]>({
  reducer: (_current: string[] = [], update: string[] = []) => {
    const out: string[] = [];
    for (const line of update) if (line && !out.includes(line)) out.push(line);
    return out;
  },
  default: () => [],
});

export const GraphState = Annotation.Root({
  /* --- the request, as it arrived --------------------------------------- */
  messages: last<ChatMessage[]>(() => []),
  context: last<AgentContext | undefined>(() => undefined),
  options: last<ChatRequest['options']>(() => undefined),
  /** The last thing the user actually said — what every node keys off. */
  userMessage: last<string>(() => ''),
  /**
   * The caller's id, used for one thing: including their own saved recipes in
   * retrieval alongside the public corpus. Not a step toward user state — the
   * agent still has no users table and cannot look this up, only receive it.
   */
  userId: last<string | undefined>(() => undefined),

  /* --- router output ---------------------------------------------------- */
  intent: last<Intent>(() => 'chat'),
  /**
   * What the turn before this one was classified as, within the same thread.
   *
   * One turn of memory, and it exists for refinements: "under 30 minutes" after
   * "what should I make for dinner?" is a continuation, but read on its own it
   * is three words with no antecedent and the router classified it as chat —
   * which skips retrieval entirely and leaves the model free to invent a dish.
   */
  previousIntent: last<Intent>(() => 'chat'),
  /**
   * The ingredients the user named *in this turn*. Distinct from the pantry:
   * naming three things is a much stronger constraint than owning forty, and
   * conflating them is how "a recipe with chicken, linguine and peppers" comes
   * back with double cream in it.
   */
  namedIngredients: last<string[]>(() => []),
  /** Explicit serving count, when stated. Null means infer and say so. */
  servings: last<number | null>(() => null),
  /**
   * A stated time limit in minutes, when there is one. Null means unconstrained.
   *
   * Kept out of the free-text query because it is a filter, not a ranking
   * signal: "under 30 minutes" retrieved perfectly good hour-long recipes,
   * since nothing downstream ever read the number.
   */
  maxMinutes: last<number | null>(() => null),
  /** Set when the answer materially forks the dish; ends the turn. */
  clarification: last<{ question: string; options: string[] } | null>(() => null),

  /* --- search output ---------------------------------------------------- */
  retrieved: last<RetrievedRecipe[]>(() => []),
  /**
   * Whether the shortlist actually answers the question. False sends a `search`
   * turn on to compose — the fallback with teeth that the old orchestrator
   * simply did not have.
   */
  retrievalSufficient: last<boolean>(() => false),
  /**
   * Ideas from outside the local corpus, for the compose prompt only.
   *
   * Never recommended: an external hit has no row, so there is nothing for a
   * recipe card to open. Off unless `RECIPE_OVERFLOW_ENABLED` is set.
   */
  overflow: last<{ title: string; cuisine: string | null; ingredients: string[] }[]>(() => []),

  /* --- compose output --------------------------------------------------- */
  draft: last<GeneratedRecipe | null>(() => null),
  /** Populated by `validate.ts`; fed back to the model on the one retry. */
  failures: last<ValidationFailure[]>(() => []),
  /**
   * Compose tries within *this* turn. Adds, so the node can report one attempt
   * at a time, except that 0 resets — the router writes it at the start of
   * every turn. Without the sentinel the count carried across a checkpointed
   * session and the second compose turn of a conversation never got its retry.
   */
  composeAttempts: Annotation<number>({
    reducer: (current: number = 0, update: number) => (update === 0 ? 0 : current + update),
    default: () => 0,
  }),

  /* --- nutrition output ------------------------------------------------- */
  /**
   * Named `macros` rather than `nutrition` because LangGraph shares one
   * namespace between channels and nodes, and there is a `nutrition` node.
   * The wire field stays `nutrition` — `respond` does the renaming, which is
   * the right place for it since that node owns the response envelope.
   */
  macros: last<NutritionBreakdown | null>(() => null),

  /* --- what the user gets told ------------------------------------------ */
  /** Decisions taken on the user's behalf. Stated, never hidden. */
  assumptions: collected,
  /** Constraints that could not be fully met, named plainly. */
  compromises: collected,

  /* --- the turn's output ------------------------------------------------ */
  /**
   * The envelope the gateway persists and the client renders.
   *
   * Written by `respond` (or by `clarify`, which ends the turn with a
   * question). Null at the end of a run means no node produced a reply, which
   * is a bug rather than a state the caller should try to render — the
   * orchestrator throws on it rather than returning an empty bubble.
   */
  response: last<ChatResponse | null>(() => null),

  /* --- observability ---------------------------------------------------- */
  /** Last model to serve a node, for the response envelope the gateway logs. */
  model: last<string | undefined>(() => undefined),
  tokensUsed: Annotation<number>({
    reducer: (current: number = 0, update: number) => current + update,
    default: () => 0,
  }),
});

export type GraphStateType = typeof GraphState.State;
export type GraphUpdate = typeof GraphState.Update;

/**
 * The constraint set for this turn.
 *
 * Derived rather than stored, for the serialisation reason above. Cheap enough
 * that three nodes calling it is not worth a cache.
 */
export const constraintsFor = (state: GraphStateType): Constraints =>
  deriveConstraints(state.context, state.namedIngredients, state.servings);

/** The last thing the user said. Empty string when there is no user turn. */
export const lastUserMessage = (messages: ChatMessage[]): string => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content;
  }
  return '';
};
