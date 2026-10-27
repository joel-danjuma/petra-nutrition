import { createFrameDecoder, type DecodedFrame } from '@petra/agent-contract';

import type { FetchResponseLike } from '../api/client';
import type { PetraApiEndpoints } from '../api/endpoints';
import { ApiError } from '../api/errors';
import type { ChatSession, GraphNode } from '../types';
import {
  replyFromMessageResponse,
  replyFromResponse,
  type ChatReply,
} from './reply';
import { createUtf8Decoder } from './utf8';

/**
 * One chat turn, from the client's side: send the user's text, stream the
 * reply, resolve to it.
 *
 * Both apps used to do this by hand. The web page carried a 120-line SSE
 * parser of its own, and fell back to the whole-reply endpoint on *any*
 * failure — including one halfway through a reply, which asked the question a
 * second time and stored it twice. Mobile did not stream at all, and created a
 * new session every time the tab mounted.
 *
 * The rules this module keeps, so neither screen has to:
 *
 * - **A session is created only when a turn needs one.** Opening the screen
 *   creates nothing.
 * - **Frames are read by the contract's decoder** — the same one the API uses
 *   on the agent's stream — so the wire format has one reader.
 * - **Fall back only when nothing arrived.** If the stream request itself
 *   fails (network, a 5xx, the agent refusing) the API has stored nothing,
 *   and asking `/chat/message` instead is safe. Once the API has answered
 *   200, it has stored the question; a failure after that is reported as a
 *   `ChatTurnError`, and the question is never sent again.
 * - **`done` is authoritative.** Its content replaces the streamed text, so
 *   any imperfection in the live text corrects itself.
 */

/** The endpoints a turn uses. Narrow, so a test can fake just these. */
export interface ChatTurnApi {
  chat: Pick<PetraApiEndpoints['chat'], 'createSession' | 'stream' | 'sendMessage'>;
}

export interface ChatTurnOptions {
  /** The conversation to continue. Omitted, one is created for this turn. */
  sessionId?: string | null;
  /** The user's message. */
  text: string;
  /** Cancels the turn. An abort rejects with the platform's AbortError. */
  signal?: AbortSignal;
  /** A session was created for this turn — before any reply, so a screen
   *  can list it straight away. */
  onSession?: (session: ChatSession) => void;
  /**
   * What the assistant is doing ("Working out the macros"). Composing a dish
   * takes seconds of silent work, and a bare spinner that long reads as a
   * hang.
   */
  onProgress?: (label: string, node: GraphNode) => void;
  /** The reply's text so far, accumulated — render it as it is. */
  onText?: (text: string) => void;
  /** The assistant is asking a clarifying question, with tappable answers. */
  onInterrupt?: (question: string, options: string[]) => void;
}

export interface ChatTurnResult {
  /** The session the turn was stored in — new, if none was passed. */
  sessionId: string;
  reply: ChatReply;
  /** `whole` when the stream never started and `/chat/message` answered. */
  via: 'stream' | 'whole';
}

/**
 * A turn that failed after the API accepted it. Not retried: the question is
 * already stored, and sending it again would store it twice.
 */
export class ChatTurnError extends ApiError {
  /** What had arrived before it failed, so a screen can leave it showing. */
  readonly partialText: string;

  constructor(code: string, message: string, partialText: string) {
    // 200: the API did answer; the reply broke after that.
    super(code, message, 200);
    this.name = 'ChatTurnError';
    this.partialText = partialText;
  }
}

/** Session titles are the opening words, as the web page always named them. */
const TITLE_LENGTH = 50;

const isAbort = (err: unknown, signal?: AbortSignal): boolean =>
  Boolean(signal?.aborted) ||
  (typeof err === 'object' &&
    err !== null &&
    (err as { name?: unknown }).name === 'AbortError');

/**
 * Run one turn. Resolves to the reply and the session it was stored in;
 * rejects with an `ApiError` (a `ChatTurnError` once streaming had begun), or
 * with an AbortError when `signal` fired.
 */
export async function startChatTurn(
  api: ChatTurnApi,
  options: ChatTurnOptions
): Promise<ChatTurnResult> {
  const { text, signal } = options;

  let sessionId = options.sessionId ?? null;
  if (!sessionId) {
    const session = await api.chat.createSession({
      title: text.trim().slice(0, TITLE_LENGTH),
    });
    sessionId = session.id;
    options.onSession?.(session);
  }

  let response: FetchResponseLike;
  try {
    response = await api.chat.stream({ sessionId, message: text }, signal);
  } catch (err) {
    if (isAbort(err, signal)) throw err;
    // No response, so no bytes: the API stores the question only once the
    // agent has accepted the stream, which it did not. Asking for the whole
    // reply cannot duplicate anything.
    const whole = await api.chat.sendMessage({ sessionId, message: text });
    return { sessionId, reply: replyFromMessageResponse(whole), via: 'whole' };
  }

  const reply = await readReply(response, options);
  return { sessionId, reply, via: 'stream' };
}

/** Read a stream to its `done` frame. */
async function readReply(
  response: FetchResponseLike,
  options: ChatTurnOptions
): Promise<ChatReply> {
  const decoder = createFrameDecoder();
  // Only where the contract decoder could not decode bytes itself.
  const utf8 =
    typeof globalThis.TextDecoder === 'undefined' ? createUtf8Decoder() : null;

  let text = '';
  let question: string | undefined;
  let reply: ChatReply | null = null;

  const take = (frames: DecodedFrame[]) => {
    for (const frame of frames) {
      // An unknown event is a newer API talking to an older app; an invalid
      // one is worth no more than its absence. Either way the turn goes on,
      // and a missing `done` is caught below.
      if (!frame.ok || reply) continue;
      const { event } = frame;
      switch (event.event) {
        case 'node':
          options.onProgress?.(event.data.label, event.data.node);
          break;
        case 'chunk':
          text += event.data.content;
          options.onText?.(text);
          break;
        case 'interrupt':
          question = event.data.question;
          options.onInterrupt?.(event.data.question, event.data.options);
          break;
        case 'done':
          reply = replyFromResponse(event.data);
          break;
        case 'error':
          throw new ChatTurnError(event.data.code, event.data.message, text);
      }
    }
  };

  const body = response.body;
  if (!body) {
    // A platform that cannot stream still gets the body, all at once.
    take(decoder.push(await response.text()));
    take(decoder.end());
  } else {
    const reader = body.getReader();
    try {
      while (!reply) {
        let chunk: Awaited<ReturnType<typeof reader.read>>;
        try {
          chunk = await reader.read();
        } catch (err) {
          if (isAbort(err, options.signal)) throw err;
          throw new ChatTurnError(
            'STREAM_INTERRUPTED',
            'The connection dropped before the reply finished.',
            text
          );
        }
        if (chunk.done) {
          if (utf8) take(decoder.push(utf8.end()));
          take(decoder.end());
          break;
        }
        take(decoder.push(utf8 ? utf8.decode(chunk.value) : chunk.value));
      }
    } finally {
      // Done early (the `done` frame, or an `error` one): let the connection
      // go rather than hold it open for bytes nobody will read.
      reader.cancel().catch(() => undefined);
    }
  }

  // Assigned inside `take`; TypeScript cannot see that through the closure.
  const finished = reply as ChatReply | null;
  if (!finished) {
    throw new ChatTurnError(
      'STREAM_INCOMPLETE',
      'The reply was cut off before it finished.',
      text
    );
  }
  return question ? { ...finished, question } : finished;
}

/**
 * Keep a dish the assistant composed. Sends back exactly what the reply
 * carried — recipe and macros — so what is saved is what was on screen, and
 * resolves to the new recipe's id.
 */
export async function saveGeneratedRecipe(
  api: { recipes: Pick<PetraApiEndpoints['recipes'], 'saveGenerated'> },
  reply: Pick<ChatReply, 'generatedRecipe' | 'nutrition'>
): Promise<string> {
  if (!reply.generatedRecipe) {
    throw new Error('This reply has no composed recipe to save.');
  }
  const saved = await api.recipes.saveGenerated({
    recipe: reply.generatedRecipe,
    nutrition: reply.nutrition,
  });
  return saved.id;
}
