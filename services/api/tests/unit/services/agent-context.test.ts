import {
  AgentContextService,
  agentUser,
  fromRequestContext,
} from '../../../src/services/agent-context';
import type { PantryService } from '../../../src/services/pantry';
import { prisma } from '../../../src/database';

jest.mock('../../../src/database', () => ({
  prisma: { user: { findUnique: jest.fn() } },
}));
jest.mock('../../../src/services/pantry', () => ({ PantryService: jest.fn() }));

const findUser = prisma.user.findUnique as jest.Mock;

const profile = {
  allergies: ['peanuts'],
  dietaryRestrictions: ['vegetarian'],
  healthGoals: ['WEIGHT_LOSS'],
};

const storedPantry = {
  items: [{ name: 'rice', quantity: 2, unit: 'kg' }],
};

const givenUser = (subscriptionTier: 'FREE' | 'PREMIUM') =>
  findUser.mockResolvedValue({ id: 'u1', subscriptionTier, profile });

describe('AgentContextService', () => {
  let getItems: jest.Mock;
  let service: AgentContextService;

  beforeEach(() => {
    getItems = jest.fn().mockResolvedValue(storedPantry);
    service = new AgentContextService({ getItems } as unknown as PantryService);
  });

  it('always carries the profile allergies', async () => {
    givenUser('FREE');

    const context = await service.forUser('u1', {
      allergies: [],
      dietaryRestrictions: ['halal'],
    });

    expect(context.allergies).toEqual(['peanuts']);
    expect(context.dietaryRestrictions).toEqual(['vegetarian', 'halal']);
    expect(context.healthGoals).toEqual(['WEIGHT_LOSS']);
  });

  it('gives the stored pantry to premium users only', async () => {
    givenUser('FREE');
    expect((await service.forUser('u1')).pantryNames).toEqual([]);
    expect(getItems).not.toHaveBeenCalled();

    givenUser('PREMIUM');
    const context = await service.forUser('u1');
    expect(context.pantryNames).toEqual(['rice']);
    expect(context.currentPantryItems).toEqual(['rice (2 kg)']);
  });

  it('lets a supplied pantry replace the stored one', async () => {
    givenUser('PREMIUM');

    const context = await service.forUser('u1', { pantry: [] });

    expect(context.pantryNames).toEqual([]);
    expect(getItems).not.toHaveBeenCalled();
  });

  it('fails rather than sending an empty context', async () => {
    findUser.mockRejectedValue(new Error('db down'));

    await expect(service.forUser('u1')).rejects.toThrow('db down');
  });
});

describe('fromRequestContext', () => {
  it('drops fields a client may not supply', () => {
    const supplied = fromRequestContext({
      currentPantryItems: ['caviar'],
      pantryNames: ['caviar'],
      pantry: ['caviar'],
      allergies: ['shellfish', 42],
      lastRecipeSearch: 'risotto',
    });

    expect(supplied).toEqual({
      allergies: ['shellfish'],
      dietaryRestrictions: [],
      activeMealPlan: undefined,
      lastRecipeSearch: 'risotto',
    });
  });

  it('tolerates a missing or malformed body', () => {
    expect(fromRequestContext(undefined)).toEqual({});
    expect(fromRequestContext('nope')).toEqual({});
  });
});

describe('agentUser', () => {
  it('maps anything but PREMIUM to FREE', () => {
    expect(agentUser({ id: 'u1', subscriptionTier: 'PREMIUM' })).toEqual({
      id: 'u1',
      subscriptionTier: 'PREMIUM',
    });
    expect(
      agentUser({ id: 'u1', subscriptionTier: null }).subscriptionTier
    ).toBe('FREE');
  });
});
