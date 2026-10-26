import { PassThrough, Readable } from 'stream';
import { finished } from 'stream/promises';
import type { Request, Response } from 'express';
import type { UserProfile } from '@prisma/client';
import {
  encodeFrame,
  type ChatRequest,
  type ChatResponse,
} from '@petra/agent-contract';

import { ChatController } from '../../../src/controllers/chat';
import {
  ChatTurns,
  type AgentPort,
} from '../../../src/services/chat-turn';
import { UpstreamUnavailableError } from '../../../src/middleware/error';
import { prismaMock } from '../../setup';

/**
 * The chat turn, asserted at its interface: what reaches the agent, and what
 * ends up in the transcript. The agent is a fake behind `AgentPort`; the
 * database is the Prisma mock, so "stored" means a `chatMessage.create` call.
 */

const SESSION_ID = '00000000-0000-4000-8000-000000000001';
const CALLER = { id: 'u1', subscriptionTier: 'FREE' };

/** A reply with every stored field set, and valid against the contract. */
const REPLY: ChatResponse = {
  content: 'A quick dal, using your lentils.',
  type: 'recipe_suggestion',
  confidence: 0.8,
  structuredData: { cuisine: 'Indian' },
  recipeId: 'recipe-1',
  suggestions: ['Make it spicier', 'Swap the rice'],
  generatedRecipe: {
    title: 'Red lentil dal',
    servings: 2,
    prepTime: 5,
    cookTime: 20,
    difficulty: 'EASY',
    ingredients: [{ name: 'red lentils', amount: 200, unit: 'g' }],
    instructions: [{ step: 1, instruction: 'Simmer the lentils.' }],
    inspiredBy: [],
  },
  nutrition: {
    perServing: { calories: 350, protein: 24, carbs: 60, fat: 2 },
    servings: 2,
    confidence: 'high',
    items: [{ ingredient: 'red lentils', grams: 200, source: 'usda' }],
  },
  assumptions: ['Assumed 2 servings'],
  compromises: ['No fresh chilli, so used flakes'],
  model: 'fast',
  tokensUsed: 321,
};

const STORED_FIELDS = [
  'type',
  'confidence',
  'structuredData',
  'recipeId',
  'generatedRecipe',
  'nutrition',
  'assumptions',
  'compromises',
  'suggestions',
] as const;

/** The second adapter behind the port. Records every request it is sent. */
class FakeAgent implements AgentPort {
  readonly requests: ChatRequest[] = [];
  reply: ChatResponse = REPLY;
  failure: Error | null = null;
  readonly upstream = new PassThrough();

  async chat(request: ChatRequest): Promise<ChatResponse> {
    this.requests.push(request);
    if (this.failure) throw this.failure;
    return this.reply;
  }

  async chatStream(request: ChatRequest): Promise<Readable> {
    this.requests.push(request);
    if (this.failure) throw this.failure;
    return this.upstream;
  }
}

interface StoredRow {
  role: string;
  content: { type: string; text: string }[];
  metadata?: Record<string, unknown>;
}

/** Every message written, in order. */
const stored = (): StoredRow[] =>
  prismaMock.chatMessage.create.mock.calls.map(
    ([arg]) => arg.data as unknown as StoredRow
  );

const expectFullMetadata = (row: StoredRow) => {
  expect(row.role).toBe('ASSISTANT');
  expect(row.content).toEqual([{ type: 'text', text: REPLY.content }]);
  for (const field of STORED_FIELDS) {
    expect(row.metadata?.[field]).toEqual(REPLY[field]);
  }
};

const tick = () => new Promise(resolve => setImmediate(resolve));

let agent: FakeAgent;
let turns: ChatTurns;

beforeEach(() => {
  agent = new FakeAgent();
  turns = new ChatTurns(agent);

  prismaMock.chatSession.findFirst.mockResolvedValue({
    id: SESSION_ID,
  } as never);
  prismaMock.chatMessage.findMany.mockResolvedValue([
    {
      role: 'ASSISTANT',
      content: [{ type: 'text', text: 'Hi, what are we cooking?' }],
    },
  ] as never);
  prismaMock.chatMessage.create.mockResolvedValue({ id: 'm1' } as never);
  prismaMock.userProfile.findUnique.mockResolvedValue({
    allergies: ['peanuts'],
    dietaryRestrictions: [],
    healthGoals: [],
  } as unknown as UserProfile);
  prismaMock.recipe.findUnique.mockResolvedValue({
    id: 'recipe-1',
    title: 'Dal',
  } as never);
});

describe('whole reply', () => {
  it('stores the question and every reply field, after the agent answers', async () => {
    const turn = await turns.reply({
      caller: CALLER,
      sessionId: SESSION_ID,
      text: 'dinner with lentils?',
    });

    const rows = stored();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      role: 'USER',
      content: [{ type: 'text', text: 'dinner with lentils?' }],
    });
    expectFullMetadata(rows[1]);

    // The response shape clients already read.
    expect(turn).toMatchObject({
      message: { id: 'm1' },
      content: REPLY.content,
      recipe: { id: 'recipe-1' },
      suggestions: REPLY.suggestions,
      generatedRecipe: REPLY.generatedRecipe,
      nutrition: REPLY.nutrition,
      assumptions: REPLY.assumptions,
      compromises: REPLY.compromises,
    });
  });

  it('sends the history plus the new message, on the session thread', async () => {
    await turns.reply({
      caller: CALLER,
      sessionId: SESSION_ID,
      text: 'dinner with lentils?',
      requestContext: { allergies: [], maxContextMessages: 4 },
    });

    const [request] = agent.requests;
    expect(request.options).toEqual({ threadId: SESSION_ID });
    expect(request.messages).toEqual([
      { role: 'assistant', content: 'Hi, what are we cooking?' },
      { role: 'user', content: 'dinner with lentils?' },
    ]);
    expect(request.context?.allergies).toEqual(['peanuts']);
    expect(prismaMock.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 4 })
    );
  });

  it('stores nothing when the agent fails', async () => {
    agent.failure = new UpstreamUnavailableError('assistant');

    await expect(
      turns.reply({ caller: CALLER, sessionId: SESSION_ID, text: 'hello?' })
    ).rejects.toBe(agent.failure);

    expect(prismaMock.chatMessage.create).not.toHaveBeenCalled();
  });

  it("refuses a session the caller doesn't own, before asking the agent", async () => {
    prismaMock.chatSession.findFirst.mockResolvedValue(null);

    await expect(
      turns.reply({ caller: CALLER, sessionId: SESSION_ID, text: 'hi' })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(agent.requests).toHaveLength(0);
  });
});

describe('opening message', () => {
  it('stores the full reply, on the new session thread', async () => {
    prismaMock.chatSession.create.mockResolvedValue({
      id: SESSION_ID,
      messages: [],
    } as never);
    prismaMock.chatMessage.findMany.mockResolvedValue([]);
    const res = { status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);

    await new ChatController(agent).createSession(
      {
        user: CALLER,
        body: { title: 'Dinner', initialMessage: 'dinner with lentils?' },
      } as unknown as Request,
      res as unknown as Response
    );

    const rows = stored();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ role: 'USER' });
    expectFullMetadata(rows[1]);
    expect(agent.requests[0].options).toEqual({ threadId: SESSION_ID });
    expect(agent.requests[0].context?.allergies).toEqual(['peanuts']);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('streamed reply', () => {
  const start = async () => {
    const body = await turns.stream({
      caller: CALLER,
      sessionId: SESSION_ID,
      text: 'dinner with lentils?',
      signal: new AbortController().signal,
    });
    let forwarded = '';
    body.on('data', (chunk: Buffer) => (forwarded += chunk.toString('utf8')));
    return { body, forwarded: () => forwarded };
  };

  it('stores the question once the agent accepts, and the reply only on done', async () => {
    const { body, forwarded } = await start();

    expect(agent.requests[0].options).toEqual({ threadId: SESSION_ID });
    expect(stored().map(row => row.role)).toEqual(['USER']);

    const progress =
      encodeFrame({
        event: 'node',
        data: { node: 'compose_recipe', label: 'Composing' },
      }) + encodeFrame({ event: 'chunk', data: { content: 'A quick ' } });
    agent.upstream.write(progress);
    await tick();
    expect(stored().map(row => row.role)).toEqual(['USER']);

    // The done frame split across two writes, as the network may deliver it.
    const done = encodeFrame({ event: 'done', data: REPLY });
    agent.upstream.write(done.slice(0, 40));
    await tick();
    expect(stored()).toHaveLength(1);
    agent.upstream.end(done.slice(40));
    await finished(body);

    const rows = stored();
    expect(rows).toHaveLength(2);
    expectFullMetadata(rows[1]);
    // The bytes go through unaltered.
    expect(forwarded()).toBe(progress + done);
  });

  it('stores no reply for a stream that ends without done', async () => {
    const { body } = await start();

    agent.upstream.write(encodeFrame({ event: 'chunk', data: { content: 'A' } }));
    agent.upstream.end(
      encodeFrame({
        event: 'error',
        data: { code: 'AGENT_STREAM_FAILED', message: 'rate limited' },
      })
    );
    await finished(body);

    expect(stored().map(row => row.role)).toEqual(['USER']);
  });

  it('stores nothing when the agent refuses the stream', async () => {
    agent.failure = new UpstreamUnavailableError('assistant');

    await expect(start()).rejects.toBe(agent.failure);
    expect(prismaMock.chatMessage.create).not.toHaveBeenCalled();
  });
});
