import type { Request, Response } from 'express';
import type { UserProfile } from '@prisma/client';
import type { ChatRequest } from '@petra/agent-contract';

import { ChatController } from '../../../src/controllers/chat';
import { MealPlanController } from '../../../src/controllers/meal-plan';
import { RecipeController } from '../../../src/controllers/recipe';
import { agentClient } from '../../../src/services/agent-client';
import { ChatService } from '../../../src/services/chat';
import { prismaMock } from '../../setup';

/**
 * Every path that asks the agent for food sends the profile's allergies.
 *
 * Recipe generation, meal-plan generation and the quick suggestion each used
 * to hand-build a context with `allergies: []`, and chat let the request body
 * overwrite the profile's. These assert on the request the agent receives,
 * which is the only place the difference is observable.
 */

jest.mock('../../../src/services/agent-client', () => ({
  agentClient: { chat: jest.fn(), chatStream: jest.fn() },
}));

const chat = agentClient.chat as jest.MockedFunction<typeof agentClient.chat>;

const REPLY = {
  content: 'Here you go.',
  type: 'text',
  confidence: 0.9,
  suggestions: [],
} as unknown as Awaited<ReturnType<typeof agentClient.chat>>;

const SESSION_ID = '00000000-0000-4000-8000-000000000001';

function request(body: Record<string, unknown>): Request {
  return {
    user: { id: 'u1', email: 'a@b.c', subscriptionTier: 'FREE' },
    body,
    params: {},
    query: {},
  } as unknown as Request;
}

function response(): Response {
  const res = {
    json: jest.fn(),
    status: jest.fn(),
  };
  res.status.mockReturnValue(res);
  return res as unknown as Response;
}

/** The request the agent was sent on the most recent call. */
const sent = (): ChatRequest => chat.mock.calls[chat.mock.calls.length - 1][0];

describe('agent requests carry the profile allergies', () => {
  beforeEach(() => {
    chat.mockReset();
    chat.mockResolvedValue(REPLY);
    prismaMock.userProfile.findUnique.mockResolvedValue({
      allergies: ['peanuts'],
      dietaryRestrictions: [],
      healthGoals: [],
    } as unknown as UserProfile);
  });

  it('recipe generation', async () => {
    await new RecipeController().generateRecipe(
      request({ prompt: 'a quick curry' }),
      response()
    );

    expect(sent().context?.allergies).toEqual(['peanuts']);
    expect(sent().user).toEqual({ id: 'u1', subscriptionTier: 'FREE' });
    expect(sent().options).toBeUndefined();
  });

  it('meal-plan generation', async () => {
    await new MealPlanController().generateMealPlan(
      request({
        days: 1,
        pantryItems: ['rice'],
        preferences: { dietaryRestrictions: ['halal'] },
      }),
      response()
    );

    expect(sent().context?.allergies).toEqual(['peanuts']);
    expect(sent().context?.dietaryRestrictions).toEqual(['halal']);
    // FREE: the request's pantry is not a way around the tier.
    expect(sent().context?.pantryNames).toEqual([]);
  });

  it('quick suggestion', async () => {
    await new MealPlanController().quickSuggestion(
      request({ mealType: 'lunch', pantryItems: ['bread'] }),
      response()
    );

    expect(sent().context?.allergies).toEqual(['peanuts']);
    expect(sent().context?.pantryNames).toEqual([]);
  });

  describe('chat', () => {
    let spies: jest.SpyInstance[];

    beforeEach(() => {
      spies = [
        jest
          .spyOn(ChatService.prototype, 'getSession')
          .mockResolvedValue({ id: SESSION_ID } as never),
        jest
          .spyOn(ChatService.prototype, 'addMessage')
          .mockResolvedValue({ id: 'm1' } as never),
        jest
          .spyOn(ChatService.prototype, 'getRecentMessages')
          .mockResolvedValue([
            { role: 'USER', content: [{ type: 'text', text: 'dinner?' }] },
          ] as never),
      ];
    });

    afterEach(() => spies.forEach(s => s.mockRestore()));

    it('sends the profile allergies even when the request tries to clear them', async () => {
      await new ChatController().sendMessage(
        request({
          sessionId: SESSION_ID,
          content: 'dinner?',
          context: {
            allergies: [],
            pantryNames: ['caviar'],
            maxContextMessages: 4,
          },
        }),
        response()
      );

      expect(sent().context?.allergies).toEqual(['peanuts']);
      expect(sent().context?.pantryNames).toEqual([]);
      expect(sent().options).toEqual({ threadId: SESSION_ID });
      // The history window is still honoured, read on its own.
      expect(ChatService.prototype.getRecentMessages).toHaveBeenCalledWith(
        SESSION_ID,
        4
      );
    });
  });
});
