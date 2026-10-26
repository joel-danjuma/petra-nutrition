import {
  createFrameDecoder,
  encodeFrame,
  HEARTBEAT_FRAME,
  type DecodedFrame,
  type StreamEventInput,
} from '../src';

/**
 * The frame codec, asserted at its interface: what the encoder writes, the
 * decoder reads back, however the bytes happen to be chunked on the way.
 */

const DONE: StreamEventInput = {
  event: 'done',
  data: {
    content: 'Try the lentil dal.\n\nIt uses your spinach.',
    type: 'recipe_suggestion',
    recipeId: 'r1',
    suggestions: ['Make it spicier'],
  },
};

const TRANSCRIPT: StreamEventInput[] = [
  { event: 'node', data: { node: 'search', label: 'Looking through recipes' } },
  { event: 'chunk', data: { content: 'Try the ' } },
  { event: 'chunk', data: { content: 'lentil dal — ½ tsp cumin 🌶️' } },
  DONE,
];

const events = (frames: DecodedFrame[]) =>
  frames.map(frame => {
    if (!frame.ok) throw new Error(`unexpected error: ${frame.error.message}`);
    return frame.event;
  });

const bytes = (text: string) => new TextEncoder().encode(text);

describe('encodeFrame / createFrameDecoder', () => {
  it('round-trips every event, applying the schema defaults', () => {
    const decoder = createFrameDecoder();
    const decoded = events(decoder.push(TRANSCRIPT.map(encodeFrame).join('')));

    expect(decoded.map(e => e.event)).toEqual([
      'node',
      'chunk',
      'chunk',
      'done',
    ]);
    expect(decoded[2]).toEqual(TRANSCRIPT[2]);
    // `assumptions` and `compromises` default to [] on the way in.
    expect(decoded[3]).toEqual({
      event: 'done',
      data: { ...DONE.data, assumptions: [], compromises: [] },
    });
    expect(decoder.end()).toEqual([]);
  });

  it('writes one data line even when the content has blank lines', () => {
    const frame = encodeFrame(DONE);
    expect(frame.endsWith('\n\n')).toBe(true);
    expect(frame.slice(0, -2)).not.toContain('\n\n');
  });

  it('reassembles a frame split across chunks, byte by byte', () => {
    // Byte-wise splitting also cuts the multi-byte characters in half, which
    // is what a streaming TextDecoder is for.
    const wire = bytes(TRANSCRIPT.map(encodeFrame).join(''));
    const decoder = createFrameDecoder();
    const decoded: DecodedFrame[] = [];
    for (let i = 0; i < wire.length; i++) {
      decoded.push(...decoder.push(wire.subarray(i, i + 1)));
    }
    decoded.push(...decoder.end());

    expect(events(decoded)).toHaveLength(4);
    expect(events(decoded)[2]).toEqual(TRANSCRIPT[2]);
  });

  it('returns nothing until the blank line that ends a frame arrives', () => {
    const decoder = createFrameDecoder();
    const frame = encodeFrame({ event: 'chunk', data: { content: 'hi' } });

    expect(decoder.push(frame.slice(0, -1))).toEqual([]);
    expect(events(decoder.push('\n'))).toEqual([
      { event: 'chunk', data: { content: 'hi' } },
    ]);
  });

  it('accepts CRLF line endings, even split between chunks', () => {
    const decoder = createFrameDecoder();
    const decoded = [
      ...decoder.push('event: chunk\r\ndata: {"content":"a"}\r'),
      ...decoder.push('\n\r\n'),
    ];
    expect(events(decoded)).toEqual([
      { event: 'chunk', data: { content: 'a' } },
    ]);
  });

  it('skips heartbeats and comment lines', () => {
    const decoder = createFrameDecoder();
    const decoded = decoder.push(
      HEARTBEAT_FRAME +
        ': another comment\n\n' +
        ': inline comment\n' +
        encodeFrame({ event: 'chunk', data: { content: 'x' } }) +
        HEARTBEAT_FRAME
    );
    expect(events(decoded)).toEqual([
      { event: 'chunk', data: { content: 'x' } },
    ]);
  });

  it('surfaces malformed JSON as an error and keeps decoding', () => {
    const decoder = createFrameDecoder();
    const decoded = decoder.push(
      'event: chunk\ndata: {"content": \n\n' + encodeFrame(DONE)
    );

    expect(decoded).toHaveLength(2);
    expect(decoded[0]).toMatchObject({
      ok: false,
      error: { reason: 'malformed', event: 'chunk' },
    });
    expect(decoded[1]).toMatchObject({ ok: true, event: { event: 'done' } });
  });

  it('distinguishes an unknown event from an invalid payload', () => {
    const decoder = createFrameDecoder();
    const decoded = decoder.push(
      'event: telemetry\ndata: {}\n\n' +
        'event: chunk\ndata: {"text":"wrong field"}\n\n' +
        'event: chunk\n\n'
    );

    expect(decoded.map(f => (f.ok ? 'ok' : f.error.reason))).toEqual([
      'unknown-event',
      'invalid',
      'malformed',
    ]);
  });

  it('decodes an unterminated final frame on end()', () => {
    const decoder = createFrameDecoder();
    const frame = encodeFrame(DONE).trimEnd();

    expect(decoder.push(frame)).toEqual([]);
    expect(events(decoder.end())).toHaveLength(1);
  });
});
