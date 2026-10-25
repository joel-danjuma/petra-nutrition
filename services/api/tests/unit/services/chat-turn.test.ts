import type { AgentContextService } from '../../../src/services/agent-context';
import type { ChatService } from '../../../src/services/chat';
import { ChatTurn, messageText } from '../../../src/services/chat-turn';
import { NotFoundError } from '../../../src/middleware/error';

jest.mock('../../../src/services/chat', () => ({ ChatService: jest.fn() }));
jest.mock('../../../src/services/agent-context', () => ({
  ...jest.requireActual('../../../src/services/agent-context'),
  agentContext: {},
}));

const context = {
  currentPantryItems: [],
  pantryNames: [],
  dietaryRestrictions: [],
  healthGoals: [],
  allergies: ['peanuts'],
};

describe('ChatTurn', () => {
  let chat: {
    isOwner: jest.Mock;
    addMessage: jest.Mock;
    getRecentMessages: jest.Mock;
  };
  let forUser: jest.Mock;
  let turn: ChatTurn;

  beforeEach(() => {
    chat = {
      isOwner: jest.fn().mockResolvedValue(true),
      addMessage: jest.fn().mockResolvedValue({ id: 'm1' }),
      getRecentMessages: jest.fn().mockResolvedValue([
        { role: 'USER', content: 'hi' },
        { role: 'ASSISTANT', content: [{ type: 'text', text: 'hello' }] },
      ]),
    };
    forUser = jest.fn().mockResolvedValue(context);
    turn = new ChatTurn(
      chat as unknown as ChatService,
      { forUser } as unknown as AgentContextService
    );
  });

  it('stores the user message and builds the agent request', async () => {
    const request = await turn.begin({
      sessionId: 's1',
      user: { id: 'u1', subscriptionTier: 'PREMIUM' },
      content: 'what can I cook?',
      historyLimit: 5,
      supplied: { lastRecipeSearch: 'pasta' },
    });

    expect(chat.addMessage).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        role: 'USER',
        content: [{ type: 'text', text: 'what can I cook?' }],
      })
    );
    expect(chat.getRecentMessages).toHaveBeenCalledWith('s1', 5);
    expect(forUser).toHaveBeenCalledWith('u1', { lastRecipeSearch: 'pasta' });
    expect(request).toEqual({
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
      user: { id: 'u1', subscriptionTier: 'PREMIUM' },
      context,
    });
  });

  it("refuses a session the caller doesn't own, before storing anything", async () => {
    chat.isOwner.mockResolvedValue(false);

    await expect(
      turn.begin({ sessionId: 's1', user: { id: 'u2' }, content: 'hi' })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(chat.addMessage).not.toHaveBeenCalled();
  });

  it('stores the whole reply, structured data and recipe card included', async () => {
    await turn.complete('s1', {
      content: 'Try the risotto.',
      type: 'recipe_suggestion',
      structuredData: { servings: 2 },
      recipeId: 'r1',
      confidence: 0.9,
    });

    expect(chat.addMessage).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        role: 'ASSISTANT',
        content: [{ type: 'text', text: 'Try the risotto.' }],
        metadata: {
          type: 'recipe_suggestion',
          confidence: 0.9,
          structuredData: { servings: 2 },
          recipeId: 'r1',
        },
      })
    );
  });
});

describe('messageText', () => {
  it('flattens both stored content shapes', () => {
    expect(messageText('plain')).toBe('plain');
    expect(
      messageText([
        { type: 'text', text: 'a' },
        { type: 'image' },
        { type: 'text', text: 'b' },
      ])
    ).toBe('a\nb');
    expect(messageText(null)).toBe('');
  });
});
