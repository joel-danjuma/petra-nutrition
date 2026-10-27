import {
  encodeFrame,
  HEARTBEAT_FRAME,
  type ChatResponse,
  type GeneratedRecipe,
  type NutritionBreakdown,
  type StreamEventInput,
} from '@petra/agent-contract';

import {
  ApiClient,
  type FetchInit,
  type FetchLike,
  type FetchResponseLike,
} from '../src/api/client';
import { PetraApiEndpoints } from '../src/api/endpoints';
import {
  ChatTurnError,
  replyFromStoredMessage,
  saveGeneratedRecipe,
  startChatTurn,
} from '../src/chat';
import { createUtf8Decoder } from '../src/chat/utf8';

const BASE = 'http://api.test/api';
const SESSION = 'session-1';

interface Call {
  url: string;
  init: FetchInit;
}

const encoder = new TextEncoder();

const json = (status: number, body: unknown): FetchResponseLike => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  body: null,
  text: async () => JSON.stringify(body),
});

const ok = (data: unknown) => json(200, { success: true, data });

/**
 * A 200 SSE response whose body yields `chunks` one read at a time, then
 * either ends or — with `failAfter` — errors, as a dropped connection does.
 */
const sse = (
  chunks: Array<string | Uint8Array>,
  failAfter = false
): FetchResponseLike => {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        const chunk = chunks[i++];
        controller.enqueue(
          typeof chunk === 'string' ? encoder.encode(chunk) : chunk
        );
      } else if (failAfter) {
        controller.error(new TypeError('network connection was lost'));
      } else {
        controller.close();
      }
    },
  });
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'text/event-stream' },
    body,
    text: async () => {
      throw new Error('a streamed body is read through `body`');
    },
  };
};

/** A fake transport, answering by method and path, recording every call. */
const fakeApi = (routes: Record<string, (call: Call) => FetchResponseLike>) => {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const call = { url, init };
    calls.push(call);
    const key = `${init.method} ${url.replace(BASE, '')}`;
    const route = routes[key];
    if (!route) throw new Error(`unexpected request: ${key}`);
    return route(call);
  };
  const api = new PetraApiEndpoints(
    new ApiClient({ baseUrl: BASE, fetchImpl, getToken: () => 'token' })
  );
  const posted = (path: string) =>
    calls.filter(c => c.init.method === 'POST' && c.url === `${BASE}${path}`);
  return { api, calls, posted };
};

const recipe: GeneratedRecipe = {
  title: 'Chickpea and spinach stew',
  servings: 2,
  prepTime: 10,
  cookTime: 20,
  difficulty: 'EASY',
  ingredients: [
    { name: 'chickpeas', amount: 400, unit: 'g' },
    { name: 'olive oil', amount: 1, unit: 'tbsp', staple: true },
  ],
  instructions: [{ step: 1, instruction: 'Simmer everything.' }],
  inspiredBy: [],
};

const nutrition: NutritionBreakdown = {
  perServing: { calories: 410, protein: 18, carbs: 50, fat: 12 },
  servings: 2,
  confidence: 'high',
  items: [{ ingredient: 'chickpeas', grams: 400, source: 'usda' }],
};

const done: ChatResponse = {
  content: 'Here is a stew that uses your chickpeas.',
  type: 'generated_recipe',
  generatedRecipe: recipe,
  nutrition,
  assumptions: ['Assumed two servings.'],
  compromises: [],
  suggestions: ['Make it spicier'],
};

const frames = (...events: StreamEventInput[]) => events.map(encodeFrame);

describe('startChatTurn', () => {
  it('reads a full transcript into a reply', async () => {
    const { api, posted } = fakeApi({
      'POST /chat/stream': () =>
        sse([
          HEARTBEAT_FRAME,
          ...frames(
            { event: 'node', data: { node: 'router', label: 'Reading' } },
            { event: 'chunk', data: { content: 'Here is ' } },
            { event: 'chunk', data: { content: 'a stew' } },
            { event: 'done', data: done }
          ),
        ]),
    });

    const result = await startChatTurn(api, { sessionId: SESSION, text: 'dinner?' });

    expect(result.sessionId).toBe(SESSION);
    expect(result.via).toBe('stream');
    // `done` is authoritative: its content, not the accumulated chunks.
    expect(result.reply.content).toBe(done.content);
    expect(result.reply.type).toBe('generated_recipe');
    expect(result.reply.generatedRecipe).toEqual(recipe);
    expect(result.reply.nutrition).toEqual(nutrition);
    expect(result.reply.assumptions).toEqual(['Assumed two servings.']);
    expect(result.reply.suggestions).toEqual(['Make it spicier']);
    expect(posted('/chat/stream')).toHaveLength(1);
    expect(JSON.parse(String(posted('/chat/stream')[0].init.body))).toEqual({
      sessionId: SESSION,
      message: 'dinner?',
    });
    expect(posted('/chat/message')).toHaveLength(0);
  });

  it('reports progress, live text and a clarifying question', async () => {
    const { api } = fakeApi({
      'POST /chat/stream': () =>
        sse(
          frames(
            { event: 'node', data: { node: 'search', label: 'Checking your pantry' } },
            {
              event: 'node',
              data: { node: 'compose_recipe', label: 'Writing a recipe' },
            },
            { event: 'chunk', data: { content: 'Spicy ' } },
            { event: 'chunk', data: { content: 'or mild?' } },
            {
              event: 'interrupt',
              data: { question: 'Spicy or mild?', options: ['Spicy', 'Mild'] },
            },
            {
              event: 'done',
              data: { ...done, content: 'Spicy or mild?', type: 'text' },
            }
          )
        ),
    });
    const progress: string[] = [];
    const texts: string[] = [];
    const interrupts: Array<[string, string[]]> = [];

    const { reply } = await startChatTurn(api, {
      sessionId: SESSION,
      text: 'curry',
      onProgress: (label, node) => progress.push(`${node}:${label}`),
      onText: text => texts.push(text),
      onInterrupt: (question, options) => interrupts.push([question, options]),
    });

    expect(progress).toEqual([
      'search:Checking your pantry',
      'compose_recipe:Writing a recipe',
    ]);
    // Accumulated, so a screen renders the argument as it is.
    expect(texts).toEqual(['Spicy ', 'Spicy or mild?']);
    expect(interrupts).toEqual([['Spicy or mild?', ['Spicy', 'Mild']]]);
    expect(reply.question).toBe('Spicy or mild?');
  });

  it('decodes frames split across reads, mid-character included', async () => {
    const transcript = frames(
      { event: 'chunk', data: { content: 'Crème fraîche, ½ tsp' } },
      { event: 'done', data: { ...done, content: 'Crème fraîche, ½ tsp' } }
    ).join('');
    const bytes = encoder.encode(transcript);
    // Seven-byte reads land inside frames, lines and multi-byte characters.
    const pieces: Uint8Array[] = [];
    for (let i = 0; i < bytes.length; i += 7) pieces.push(bytes.slice(i, i + 7));

    const { api } = fakeApi({ 'POST /chat/stream': () => sse(pieces) });
    const texts: string[] = [];

    const { reply } = await startChatTurn(api, {
      sessionId: SESSION,
      text: 'x',
      onText: text => texts.push(text),
    });

    expect(texts).toEqual(['Crème fraîche, ½ tsp']);
    expect(reply.content).toBe('Crème fraîche, ½ tsp');
  });

  it('streams on a runtime with no TextDecoder', async () => {
    const transcript = encoder.encode(
      frames({ event: 'done', data: { ...done, content: 'Crème brûlée' } }).join(
        ''
      )
    );
    const pieces: Uint8Array[] = [];
    for (let i = 0; i < transcript.length; i += 5) {
      pieces.push(transcript.slice(i, i + 5));
    }
    const { api } = fakeApi({ 'POST /chat/stream': () => sse(pieces) });

    const original = globalThis.TextDecoder;
    // As on a Hermes build without one.
    Reflect.deleteProperty(globalThis, 'TextDecoder');
    try {
      const { reply } = await startChatTurn(api, { sessionId: SESSION, text: 'x' });
      expect(reply.content).toBe('Crème brûlée');
    } finally {
      globalThis.TextDecoder = original;
    }
  });

  it('skips events it does not know rather than failing the turn', async () => {
    const { api } = fakeApi({
      'POST /chat/stream': () =>
        sse([
          'event: telemetry\ndata: {"x":1}\n\n',
          ...frames({ event: 'done', data: done }),
        ]),
    });

    const { reply } = await startChatTurn(api, { sessionId: SESSION, text: 'x' });
    expect(reply.content).toBe(done.content);
  });

  it('creates a session only when the turn has none', async () => {
    const { api, posted } = fakeApi({
      'POST /chat/sessions': () => ok({ id: 'new-session', title: 'pasta' }),
      'POST /chat/stream': () => sse(frames({ event: 'done', data: done })),
    });
    const created: string[] = [];

    const result = await startChatTurn(api, {
      text: 'pasta tonight',
      onSession: session => created.push(session.id),
    });

    expect(result.sessionId).toBe('new-session');
    expect(created).toEqual(['new-session']);
    expect(JSON.parse(String(posted('/chat/sessions')[0].init.body))).toEqual({
      title: 'pasta tonight',
    });
    expect(JSON.parse(String(posted('/chat/stream')[0].init.body)).sessionId).toBe(
      'new-session'
    );
  });

  it('falls back to the whole reply when the stream never started', async () => {
    const { api, posted } = fakeApi({
      'POST /chat/stream': () => {
        throw new TypeError('Network request failed');
      },
      'POST /chat/message': () =>
        ok({
          message: {
            id: 'm-2',
            role: 'ASSISTANT',
            content: [{ type: 'text', text: 'Try the lentil soup.' }],
            metadata: {
              type: 'recipe_suggestion',
              recipeId: 'r-1',
              assumptions: [],
              compromises: [],
              suggestions: ['Something quicker'],
            },
          },
          content: 'Try the lentil soup.',
          recipe: {
            id: 'r-1',
            title: 'Lentil soup',
            imageUrl: null,
            totalTime: 30,
            servings: 4,
            dietaryTags: [],
            nutrition: null,
          },
          suggestions: ['Something quicker'],
          assumptions: [],
          compromises: [],
        }),
    });

    const result = await startChatTurn(api, { sessionId: SESSION, text: 'soup' });

    expect(result.via).toBe('whole');
    expect(posted('/chat/message')).toHaveLength(1);
    expect(result.reply).toMatchObject({
      messageId: 'm-2',
      content: 'Try the lentil soup.',
      type: 'recipe_suggestion',
      recipeId: 'r-1',
      recipe: { id: 'r-1', title: 'Lentil soup' },
      suggestions: ['Something quicker'],
    });
  });

  it('falls back when the API refuses the stream with a server error', async () => {
    const { api, posted } = fakeApi({
      'POST /chat/stream': () =>
        json(503, {
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'agent down' },
        }),
      'POST /chat/message': () =>
        ok({
          message: { role: 'ASSISTANT', content: 'ok', metadata: null },
          content: 'ok',
          recipe: null,
          assumptions: [],
          compromises: [],
        }),
    });

    const { reply } = await startChatTurn(api, { sessionId: SESSION, text: 'x' });
    expect(reply.content).toBe('ok');
    expect(posted('/chat/message')).toHaveLength(1);
  });

  it('fails a stream that breaks partway, without asking again', async () => {
    const { api, posted } = fakeApi({
      'POST /chat/stream': () =>
        sse(frames({ event: 'chunk', data: { content: 'Half a rep' } }), true),
    });

    const error = await startChatTurn(api, { sessionId: SESSION, text: 'x' }).then(
      () => null,
      (err: unknown) => err
    );

    expect(error).toBeInstanceOf(ChatTurnError);
    expect((error as ChatTurnError).code).toBe('STREAM_INTERRUPTED');
    expect((error as ChatTurnError).partialText).toBe('Half a rep');
    expect(posted('/chat/stream')).toHaveLength(1);
    expect(posted('/chat/message')).toHaveLength(0);
  });

  it('fails on an error frame, without asking again', async () => {
    const { api, posted } = fakeApi({
      'POST /chat/stream': () =>
        sse(
          frames({
            event: 'error',
            data: { code: 'AGENT_STREAM_FAILED', message: 'model timed out' },
          })
        ),
    });

    const error = await startChatTurn(api, { sessionId: SESSION, text: 'x' }).catch(
      (err: unknown) => err
    );

    expect(error).toBeInstanceOf(ChatTurnError);
    expect((error as ChatTurnError).code).toBe('AGENT_STREAM_FAILED');
    expect((error as ChatTurnError).message).toBe('model timed out');
    expect(posted('/chat/message')).toHaveLength(0);
  });

  it('fails a 200 that ends without a reply, without asking again', async () => {
    // The API stored the question before it answered 200, so a second POST
    // would store it twice even though no frame arrived.
    const { api, posted } = fakeApi({ 'POST /chat/stream': () => sse([]) });

    const error = await startChatTurn(api, { sessionId: SESSION, text: 'x' }).catch(
      (err: unknown) => err
    );

    expect((error as ChatTurnError).code).toBe('STREAM_INCOMPLETE');
    expect(posted('/chat/message')).toHaveLength(0);
  });

  it('does not fall back when the caller aborted', async () => {
    const controller = new AbortController();
    const { api, posted } = fakeApi({
      'POST /chat/stream': () => {
        controller.abort();
        const err = new Error('The operation was aborted.');
        err.name = 'AbortError';
        throw err;
      },
    });

    const error = await startChatTurn(api, {
      sessionId: SESSION,
      text: 'x',
      signal: controller.signal,
    }).catch((err: unknown) => err);

    expect((error as Error).name).toBe('AbortError');
    expect(posted('/chat/message')).toHaveLength(0);
  });

  it('reads a body the platform could not stream', async () => {
    const transcript = frames(
      { event: 'chunk', data: { content: 'all at once' } },
      { event: 'done', data: { ...done, content: 'all at once' } }
    ).join('');
    const { api } = fakeApi({
      'POST /chat/stream': () => ({
        ok: true,
        status: 200,
        headers: { get: () => 'text/event-stream' },
        body: null,
        text: async () => transcript,
      }),
    });

    const { reply } = await startChatTurn(api, { sessionId: SESSION, text: 'x' });
    expect(reply.content).toBe('all at once');
  });
});

describe('replyFromStoredMessage', () => {
  it('maps all nine stored metadata fields', () => {
    const reply = replyFromStoredMessage({
      id: 'm-1',
      role: 'ASSISTANT',
      content: [
        { type: 'text', text: 'First line' },
        { type: 'text', text: 'Second line' },
      ],
      timestamp: '2026-10-26T18:00:00.000Z',
      metadata: {
        type: 'generated_recipe',
        confidence: 0.8,
        structuredData: { source: 'compose' },
        recipeId: 'r-9',
        generatedRecipe: recipe,
        nutrition,
        assumptions: ['Assumed two servings.'],
        compromises: ['No peanut-free stock cube found.'],
        suggestions: ['Make it spicier'],
      },
    });

    expect(reply).toEqual({
      messageId: 'm-1',
      content: 'First line\nSecond line',
      type: 'generated_recipe',
      confidence: 0.8,
      structuredData: { source: 'compose' },
      recipeId: 'r-9',
      generatedRecipe: recipe,
      nutrition,
      assumptions: ['Assumed two servings.'],
      compromises: ['No peanut-free stock cube found.'],
      suggestions: ['Make it spicier'],
    });
  });

  it('drops a field that no longer matches the contract, not the message', () => {
    const reply = replyFromStoredMessage({
      role: 'ASSISTANT',
      content: 'An old row, stored as a string',
      metadata: {
        type: 'something_retired',
        generatedRecipe: { title: 'No ingredients' },
        suggestions: ['ok', 3],
      },
    });

    expect(reply.content).toBe('An old row, stored as a string');
    expect(reply.type).toBe('text');
    expect(reply.generatedRecipe).toBeUndefined();
    expect(reply.suggestions).toEqual(['ok']);
    expect(reply.assumptions).toEqual([]);
  });

  it('reads a message with no metadata at all', () => {
    const reply = replyFromStoredMessage({
      role: 'ASSISTANT',
      content: [{ type: 'text', text: 'Hello' }],
      metadata: null,
    });
    expect(reply).toMatchObject({ content: 'Hello', type: 'text', suggestions: [] });
  });
});

describe('saveGeneratedRecipe', () => {
  it('sends back exactly the recipe and macros the reply carried', async () => {
    const { api, posted } = fakeApi({
      'POST /recipes/generated': () => ok({ id: 'saved-1' }),
    });

    const id = await saveGeneratedRecipe(api, { generatedRecipe: recipe, nutrition });

    expect(id).toBe('saved-1');
    expect(JSON.parse(String(posted('/recipes/generated')[0].init.body))).toEqual({
      recipe,
      nutrition,
    });
  });
});

describe('createUtf8Decoder', () => {
  it('holds a character split across reads until it completes', () => {
    const bytes = encoder.encode('a½é€😀');
    const decoder = createUtf8Decoder();
    let out = '';
    for (const byte of bytes) out += decoder.decode(Uint8Array.of(byte));
    out += decoder.end();
    expect(out).toBe('a½é€😀');
  });

  it('replaces an invalid or unfinished sequence', () => {
    const decoder = createUtf8Decoder();
    expect(decoder.decode(Uint8Array.of(0x61, 0xff, 0x62))).toBe('a�b');
    expect(decoder.decode(Uint8Array.of(0xe2, 0x82))).toBe('');
    expect(decoder.end()).toBe('�');
  });
});
