import type { z } from 'zod';

import { streamEventSchema, type StreamEvent } from './index';

/**
 * The SSE frame codec for `POST /v1/chat/stream`.
 *
 * `streamEventSchema` says what a frame *means*; this says how one is written
 * and read. Both ends used to do that by hand — the agent with a template
 * string, the API by splitting the finished transcript on blank lines after
 * the fact — so the wire format was agreed by convention, not by code. Now the
 * writer and the reader are one module, tested against each other.
 *
 * Deliberately free of Node APIs. No `Buffer`, no streams: the decoder takes
 * strings or bytes and returns frames, so the same code reads the stream in
 * the API gateway, a browser, and React Native.
 */

/**
 * What the encoder accepts: the schema's *input* shape, so fields with a
 * default (`assumptions`, `compromises`, interrupt `options`) may be omitted
 * exactly as the decoder would tolerate.
 */
export type StreamEventInput = z.input<typeof streamEventSchema>;

/**
 * A comment frame. SSE clients ignore it; proxies and mobile radios see
 * traffic, so a connection waiting on a slow first token is not dropped.
 */
export const HEARTBEAT_FRAME = ': ping\n\n';

/**
 * Serialise one event as an SSE frame.
 *
 * One `data:` line is always enough: `JSON.stringify` escapes every newline
 * inside a string, so the payload can never contain the blank line that ends
 * a frame.
 */
export function encodeFrame(event: StreamEventInput): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

/**
 * Why a frame was rejected.
 *
 * - `malformed` — no `data:` line, or the data is not JSON.
 * - `unknown-event` — a well-formed frame whose event name this contract does
 *   not know. Usually a newer agent talking to an older client; most callers
 *   should skip it rather than fail the turn.
 * - `invalid` — a known event whose payload does not match its schema.
 */
export type FrameErrorReason = 'malformed' | 'unknown-event' | 'invalid';

export interface FrameError {
  reason: FrameErrorReason;
  /** The event name, when the frame had one. */
  event?: string;
  /** The raw frame text, for logging. */
  raw: string;
  message: string;
}

/**
 * One decoded frame.
 *
 * Invalid frames are *returned*, not thrown. A stream is a sequence of
 * independent frames, and one bad `node` frame should not cost the user the
 * `done` frame behind it — but silently dropping it would hide a contract
 * drift. Returning it lets each caller choose: the gateway logs and carries
 * on, a client may skip unknown events and surface the rest.
 */
export type DecodedFrame =
  | { ok: true; event: StreamEvent }
  | { ok: false; error: FrameError };

export interface FrameDecoder {
  /**
   * Feed the next chunk of the stream, as text or bytes. Returns every frame
   * the chunk completed, in order — possibly none, when the chunk ended
   * mid-frame; the remainder is buffered for the next call.
   */
  push(chunk: string | Uint8Array): DecodedFrame[];
  /**
   * Signal end of stream. Decodes a final frame that was not followed by a
   * blank line, which a well-behaved server never sends but a truncated one
   * might.
   */
  end(): DecodedFrame[];
}

/**
 * The event names the contract defines, computed on first use.
 *
 * Lazily, not at module load: `index.ts` re-exports this file, so the two form
 * an import cycle. Under ESM (web, Metro) the re-export is hoisted and this
 * module evaluates before `streamEventSchema` exists; touching it at the top
 * level would throw there even though it works under CommonJS.
 */
let knownEvents: ReadonlySet<string> | undefined;
const isKnownEvent = (name: string): boolean => {
  knownEvents ??= new Set(
    streamEventSchema.options.map(option => option.shape.event.value)
  );
  return knownEvents.has(name);
};

/** One frame's text, without its terminating blank line. */
function decodeFrame(raw: string): DecodedFrame | null {
  let event: string | undefined;
  const data: string[] = [];

  for (const line of raw.split('\n')) {
    // Comments, including the heartbeat. Ignored by definition.
    if (line === '' || line.startsWith(':')) continue;

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    // The spec strips exactly one leading space after the colon.
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
    // `id:` and `retry:` are legal SSE and meaningless here.
  }

  // A frame of nothing but comments is a heartbeat, not an error.
  if (event === undefined && data.length === 0) return null;

  const fail = (reason: FrameErrorReason, message: string): DecodedFrame => ({
    ok: false,
    error: { reason, event, raw, message },
  });

  if (data.length === 0) return fail('malformed', 'frame has no data line');

  let payload: unknown;
  try {
    payload = JSON.parse(data.join('\n'));
  } catch (error) {
    return fail(
      'malformed',
      error instanceof Error ? error.message : 'data is not JSON'
    );
  }

  // An unnamed frame is SSE's default `message` event, which this contract
  // never sends.
  const name = event ?? 'message';
  if (!isKnownEvent(name)) {
    return fail('unknown-event', `unknown event "${name}"`);
  }

  const parsed = streamEventSchema.safeParse({ event: name, data: payload });
  if (!parsed.success) return fail('invalid', parsed.error.message);

  return { ok: true, event: parsed.data };
}

/**
 * Create an incremental decoder for one stream.
 *
 * Chunk boundaries are arbitrary — a frame, a line, or a multi-byte character
 * can be split across two reads — so text is buffered until a blank line
 * completes a frame. Bytes are decoded with a streaming `TextDecoder`, created
 * only when bytes actually arrive, so a runtime without one can still feed
 * strings.
 */
export function createFrameDecoder(): FrameDecoder {
  let buffer = '';
  // Typed structurally rather than as `TextDecoder`: under Node's types without
  // the DOM lib, `TextDecoder` is declared only as a value, and naming it as a
  // type fails to compile in every package that type-checks this file.
  let textDecoder:
    | { decode(input?: Uint8Array, options?: { stream?: boolean }): string }
    | undefined;

  const drain = (final: boolean): DecodedFrame[] => {
    // Normalise CRLF and lone CR, both legal SSE line endings. Mid-stream, a
    // trailing '\r' may be the first half of a CRLF split across chunks, so
    // it is left for the next push to complete.
    buffer = buffer.replace(final ? /\r\n?/g : /\r\n|\r(?!$)/g, '\n');

    const frames: DecodedFrame[] = [];
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const decoded = decodeFrame(buffer.slice(0, boundary));
      if (decoded) frames.push(decoded);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');
    }

    if (final && buffer.trim() !== '') {
      const decoded = decodeFrame(buffer);
      if (decoded) frames.push(decoded);
      buffer = '';
    }
    return frames;
  };

  return {
    push(chunk) {
      if (typeof chunk === 'string') {
        buffer += chunk;
      } else {
        textDecoder ??= new TextDecoder();
        buffer += textDecoder.decode(chunk, { stream: true });
      }
      return drain(false);
    },
    end() {
      if (textDecoder) buffer += textDecoder.decode();
      return drain(true);
    },
  };
}
