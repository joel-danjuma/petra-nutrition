import { AsyncLocalStorage } from 'node:async_hooks';

import type { GraphNode } from '@petra/agent-contract';

import { logger } from '../utils/logger';

/**
 * The per-turn side channel: where a node sends progress and prose while it
 * runs, and where it learns the client has hung up.
 *
 * This is deliberately *not* graph state. State is checkpointed, and a callback
 * does not survive JSON — a `onChunk` function in a channel serialises to `{}`
 * and the next resume streams into a void. Async-local storage keeps the
 * runtime handles with the request they belong to, out of the state schema
 * entirely, so the state stays exactly what it claims to be: data about a dish.
 *
 * Every accessor tolerates an empty store. A node invoked from a unit test has
 * no turn context, and `emitNode` being a no-op there is the correct behaviour
 * rather than something the test has to stub.
 */

export interface TurnContext {
  /** Visible prose, already sanitised by the caller. Absent when not streaming. */
  onChunk?: (text: string) => void;
  /** Node-level progress, so a long compose reads as work rather than a hang. */
  onNode?: (node: GraphNode, label: string) => void;
  /** A clarifying question that ends the turn. */
  onInterrupt?: (question: string, options: string[]) => void;
  signal?: AbortSignal;
}

const storage = new AsyncLocalStorage<TurnContext>();

/** Run `fn` with `context` visible to every node it reaches. */
export function withTurnContext<T>(context: TurnContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}

export const turnContext = (): TurnContext => storage.getStore() ?? {};

/**
 * What the reader is told a node is doing.
 *
 * Present tense, no ellipsis, no jargon — this is rendered verbatim. "Writing
 * you a recipe" rather than "invoking compose_recipe": the graph's shape is an
 * implementation detail and the label is product copy.
 */
const LABELS: Record<GraphNode, string> = {
  router: 'Reading your message',
  search: 'Looking through your recipes',
  compose_recipe: 'Writing you a recipe',
  nutrition: 'Working out the macros',
  respond: 'Putting it into words',
};

export function emitNode(node: GraphNode, label = LABELS[node]): void {
  const ctx = storage.getStore();
  if (!ctx?.onNode) return;
  try {
    ctx.onNode(node, label);
  } catch (error) {
    // A client that cannot receive a progress frame must not fail the turn.
    logger.warn('Progress event dropped', { node, error });
  }
}

export function emitChunk(text: string): void {
  const ctx = storage.getStore();
  if (!ctx?.onChunk || !text) return;
  ctx.onChunk(text);
}

export function emitInterrupt(question: string, options: string[] = []): void {
  const ctx = storage.getStore();
  ctx?.onInterrupt?.(question, options);
}

export const turnSignal = (): AbortSignal | undefined => storage.getStore()?.signal;

export const isAborted = (): boolean => storage.getStore()?.signal?.aborted ?? false;
