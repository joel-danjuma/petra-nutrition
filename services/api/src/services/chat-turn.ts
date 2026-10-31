import { pipeline, Readable, Transform } from 'stream';
import type { ChatMessage } from '@prisma/client';
import {
  createFrameDecoder,
  type ChatRequest,
  type ChatResponse,
  type DecodedFrame,
} from '@petra/agent-contract';

import { prisma } from '../database';
import { NotFoundError } from '../middleware/error';
import { logger } from '../utils/logger';
import { agentClient } from './agent-client';
import {
  buildCallerContext,
  readContextAdditions,
  type Caller,
  type CallerContext,
} from './caller-context';
import { ChatService } from './chat';

/**
 * A chat turn: one user message in, one assistant reply out, both persisted.
 *
 * This used to be written three times in the chat controller — the whole-reply
 * endpoint, the streamed one, and the opening message of a new session — and
 * the three had drifted. They stored eight, seven and three of the reply's
 * fields, none of them stored `suggestions`, and all three wrote the user's
 * message *before* asking the agent, so a turn that failed left a question
 * with no answer in the transcript, and a web client falling back from a
 * failed stream to the whole-reply endpoint stored the question twice.
 *
 * Now there is one module, with two rules that hold on every path:
 *
 * - **Nothing is stored for a turn that did not happen.** The whole-reply
 *   path persists the user message and the reply together, after the agent
 *   answered. The streamed path persists the user message once the agent has
 *   accepted the stream (the reply has begun and the client is about to see
 *   it), and the reply only when the `done` frame arrives.
 * - **One mapping from reply to stored metadata** (`storedMetadata`), so a
 *   reloaded conversation shows exactly what the live one did.
 *
 * The agent is reached through `AgentPort`, so the whole turn is testable
 * against a fake agent and the Prisma mock, with no HTTP involved.
 */

/**
 * The seam to the agent service. `agentClient` satisfies it in production; a
 * fake satisfies it in tests.
 */
export interface AgentPort {
  chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse>;
  /**
   * Open a stream of SSE frames. Must reject *before* yielding any bytes when
   * the agent will not serve the turn, because that is what decides whether
   * the user message is stored.
   */
  chatStream(request: ChatRequest, signal: AbortSignal): Promise<Readable>;
}

export interface TurnInput {
  caller: Caller;
  sessionId: string;
  /** The user's message, already flattened to text. */
  text: string;
  /**
   * The request body's `context`, untrusted. Read for the caller-context
   * additions it may honour and for `maxContextMessages`, nothing else.
   */
  requestContext?: unknown;
  /**
   * A caller context already built for this request, so the profile is not
   * read twice — `createSession` builds one for the session snapshot.
   */
  callerContext?: CallerContext;
}

export interface StreamTurnInput extends TurnInput {
  /** Aborts the agent call; the controller fires it when the client leaves. */
  signal: AbortSignal;
}

/** The reply fields an assistant message is stored with. */
export type StoredReplyMetadata = Pick<
  ChatResponse,
  | 'type'
  | 'confidence'
  | 'structuredData'
  | 'recipeId'
  | 'generatedRecipe'
  | 'nutrition'
  | 'assumptions'
  | 'compromises'
  | 'suggestions'
>;

export type RecipeCard = Awaited<ReturnType<typeof hydrateRecipeCard>>;

/** What `POST /chat/message` returns as `data`. Unchanged for clients. */
export interface TurnReply {
  /** The stored assistant message. */
  message: ChatMessage;
  /**
   * Plain text alongside the stored message: the message's `content` is a
   * JSON block array, and every client wants the string.
   */
  content: string;
  /** Hydrated so the chat card renders without a second round trip. */
  recipe: RecipeCard;
  suggestions?: string[];
  /**
   * Present when the assistant composed a dish rather than finding one.
   * Unlike `recipe` there is nothing to hydrate: this *is* the recipe, until
   * the user saves it.
   */
  generatedRecipe?: ChatResponse['generatedRecipe'];
  nutrition?: ChatResponse['nutrition'];
  assumptions: string[];
  compromises: string[];
}

/** How much history a turn carries when the request does not say. */
const DEFAULT_HISTORY = 10;
const MAX_HISTORY = 50;

/**
 * `ChatMessage.content` is a Json column holding either a plain string (older
 * rows) or an array of `{ type: 'text', text }` blocks. Flatten either shape to
 * the string the model and the clients want.
 */
export function messageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(block =>
        block && typeof block === 'object' && 'text' in block
          ? String((block as { text: unknown }).text ?? '')
          : ''
      )
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/**
 * The history window a request asked for, bounded. It counts the new message.
 *
 * Read on its own rather than as part of the caller context: it is a request
 * option, not something the agent is told about the user.
 */
function historyWindow(requestContext: unknown): number {
  const raw =
    requestContext && typeof requestContext === 'object'
      ? (requestContext as { maxContextMessages?: unknown }).maxContextMessages
      : undefined;
  const n = typeof raw === 'number' ? Math.floor(raw) : NaN;
  return n >= 1 ? Math.min(n, MAX_HISTORY) : DEFAULT_HISTORY;
}

/**
 * The one mapping from an agent reply to a stored message's metadata.
 *
 * Every field the clients render from a live reply is here, so the same reply
 * reloaded from history renders the same way. `generatedRecipe` matters most:
 * a composed dish has no `recipeId` to reopen, so without it scrolling back to
 * yesterday's recipe shows the prose and nothing to cook from.
 */
export function storedMetadata(reply: ChatResponse): StoredReplyMetadata {
  return {
    type: reply.type,
    confidence: reply.confidence,
    structuredData: reply.structuredData,
    recipeId: reply.recipeId,
    generatedRecipe: reply.generatedRecipe,
    nutrition: reply.nutrition,
    assumptions: reply.assumptions,
    compromises: reply.compromises,
    suggestions: reply.suggestions,
  };
}

/**
 * Turn a grounded recipe id into the fields the chat card renders. Returns
 * null rather than throwing: a stale or hallucinated id should cost the card,
 * not the whole reply.
 */
export async function hydrateRecipeCard(recipeId?: string) {
  if (!recipeId) return null;
  try {
    const recipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      select: {
        id: true,
        title: true,
        imageUrl: true,
        totalTime: true,
        servings: true,
        dietaryTags: true,
        nutrition: { select: { calories: true, protein: true } },
        _count: { select: { ingredients: true } },
      },
    });
    if (!recipe) {
      logger.warn('Grounded recipe id not found', { recipeId });
      return null;
    }
    return recipe;
  } catch (err) {
    logger.warn('Failed to hydrate recipe card', err);
    return null;
  }
}

/** The first valid `done` frame among these, logging any frame rejected. */
function doneFrame(
  frames: DecodedFrame[],
  sessionId: string
): ChatResponse | null {
  let done: ChatResponse | null = null;
  for (const frame of frames) {
    if (!frame.ok) {
      logger.warn('Discarded an agent stream frame', {
        sessionId,
        reason: frame.error.reason,
        event: frame.error.event,
        message: frame.error.message,
      });
    } else if (frame.event.event === 'done' && !done) {
      done = frame.event.data;
    }
  }
  return done;
}

export class ChatTurns {
  constructor(
    private readonly agent: AgentPort = agentClient,
    private readonly chats: ChatService = new ChatService()
  ) {}

  /**
   * Run a turn and return the whole reply.
   *
   * The user message and the reply are written only after the agent answered,
   * so a failed turn leaves the transcript as it was and the client can simply
   * retry.
   */
  async reply(input: TurnInput): Promise<TurnReply> {
    const askedAt = new Date();
    const request = await this.prepare(input);

    const startedAt = Date.now();
    const reply = await this.agent.chat(request);
    const agentLatencyMs = Date.now() - startedAt;

    await this.storeUserMessage(input.sessionId, input.text, askedAt);
    const message = await this.storeReply(input.sessionId, reply);

    logger.info('Chat message processed', {
      userId: input.caller.id,
      sessionId: input.sessionId,
      responseType: reply.type,
      groundedRecipeId: reply.recipeId,
      model: reply.model,
      tokensUsed: reply.tokensUsed,
      // Measured rather than assumed: the extra hop was argued to be
      // negligible against a Groq call, and this is the number that says so.
      agentLatencyMs,
    });

    return {
      message,
      content: reply.content,
      recipe: await hydrateRecipeCard(reply.recipeId),
      suggestions: reply.suggestions,
      generatedRecipe: reply.generatedRecipe,
      nutrition: reply.nutrition,
      assumptions: reply.assumptions,
      compromises: reply.compromises,
    };
  }

  /**
   * Run a turn as a stream of SSE frames, to be forwarded verbatim.
   *
   * Resolves once the agent has accepted the turn; rejects, having stored
   * nothing, if it does not. The returned stream is the agent's bytes,
   * unaltered and undelayed — they are decoded as they pass only so the
   * reply can be stored when its `done` frame goes by. A stream that ends
   * without one (an error frame, an abort) stores no reply: a half-generated
   * answer is not a message.
   */
  async stream(input: StreamTurnInput): Promise<Readable> {
    const { sessionId } = input;
    const askedAt = new Date();
    const request = await this.prepare(input);

    const upstream = await this.agent.chatStream(request, input.signal);
    try {
      await this.storeUserMessage(sessionId, input.text, askedAt);
    } catch (error) {
      upstream.destroy();
      throw error;
    }

    const decoder = createFrameDecoder();
    let stored: ChatResponse | null = null;

    // Never rejects: by the time `done` arrives the client has the reply, so
    // a failed write is logged rather than turned into a broken stream.
    const storeOnce = async (reply: ChatResponse | null) => {
      if (!reply || stored) return;
      stored = reply;
      try {
        await this.storeReply(sessionId, reply);
      } catch (error) {
        logger.error('Failed to store streamed reply', { sessionId, error });
      }
    };

    const tee = new Transform({
      transform(chunk: Uint8Array, _encoding, callback) {
        // Forward first: storing the reply must not hold up its delivery.
        this.push(chunk);
        storeOnce(doneFrame(decoder.push(chunk), sessionId)).then(() =>
          callback()
        );
      },
      flush(callback) {
        storeOnce(doneFrame(decoder.end(), sessionId)).then(() => callback());
      },
    });

    return pipeline(upstream, tee, error => {
      const reply: ChatResponse | null = stored;
      if (error && !input.signal.aborted) {
        logger.warn('Agent stream ended with an error', {
          sessionId,
          message: error.message,
        });
      }
      logger.info('Chat message streamed', {
        userId: input.caller.id,
        sessionId,
        persisted: Boolean(reply),
        model: reply?.model,
        tokensUsed: reply?.tokensUsed,
      });
    });
  }

  /**
   * Check ownership and assemble the agent request.
   *
   * The new message is appended to the loaded history in memory rather than
   * read back from the database, because it has not been written yet — and
   * will not be, if the agent fails.
   */
  private async prepare({
    caller,
    sessionId,
    text,
    requestContext,
    callerContext,
  }: TurnInput): Promise<ChatRequest> {
    const session = await this.chats.getSession(sessionId, caller.id);
    if (!session) throw new NotFoundError('Chat session');

    const window = historyWindow(requestContext);
    const [{ user, context }, history] = await Promise.all([
      // The request's own context can only add constraints to the profile's,
      // never replace them — see `buildCallerContext`.
      callerContext ??
        buildCallerContext(caller, readContextAdditions(requestContext)),
      this.chats.getRecentMessages(sessionId, window),
    ]);

    const messages: ChatRequest['messages'] = [
      ...history.map(msg => ({
        role: msg.role.toLowerCase() as ChatRequest['messages'][number]['role'],
        content: messageText(msg.content),
      })),
      { role: 'user' as const, content: text },
    ].slice(-window);

    return {
      messages,
      user,
      context,
      // The chat session, so the agent's ephemeral graph state lines up with
      // the conversation the user is actually having. Deliberately the session
      // id and not the user id: one user can have several conversations, and
      // they should not share working state. The transcript is still ours;
      // what the agent keeps under this key is a TTL'd copy of one turn's
      // working channels.
      options: { threadId: sessionId },
    };
  }

  private storeUserMessage(sessionId: string, text: string, at: Date) {
    return this.chats.addMessage(sessionId, {
      role: 'USER',
      content: [{ type: 'text', text }],
      timestamp: at,
    });
  }

  private storeReply(
    sessionId: string,
    reply: ChatResponse
  ): Promise<ChatMessage> {
    return this.chats.addMessage(sessionId, {
      role: 'ASSISTANT',
      content: [{ type: 'text', text: reply.content }],
      timestamp: new Date(),
      metadata: storedMetadata(reply),
    });
  }
}
