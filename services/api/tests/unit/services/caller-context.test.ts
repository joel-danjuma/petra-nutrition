import type { UserProfile } from '@prisma/client';

import {
  buildCallerContext,
  readContextAdditions,
} from '../../../src/services/caller-context';
import { PantryService } from '../../../src/services/pantry';
import { prismaMock } from '../../setup';

/**
 * Caller context, asserted at its interface.
 *
 * The property under test is that the profile is a floor: a request can add a
 * constraint but never take one away, and a pantry is never handed to a tier
 * that does not include one. Each of these was broken at some call site before
 * the module existed.
 */

const FREE = { id: 'u-free', subscriptionTier: 'FREE' };
const PREMIUM = { id: 'u-premium', subscriptionTier: 'PREMIUM' };

const profile = (over: Partial<UserProfile> = {}) =>
  ({
    id: 'p1',
    userId: 'u1',
    allergies: ['peanuts'],
    dietaryRestrictions: ['vegetarian'],
    healthGoals: ['WEIGHT_LOSS'],
    ...over,
  }) as UserProfile;

type PantryResult = Awaited<ReturnType<PantryService['getItems']>>;

const pantryOf = (...names: string[]) =>
  ({
    items: names.map(name => ({ name, quantity: 1, unit: 'pcs' })),
  }) as unknown as PantryResult;

describe('buildCallerContext', () => {
  let getItems: jest.SpyInstance;

  beforeEach(() => {
    getItems = jest
      .spyOn(PantryService.prototype, 'getItems')
      .mockResolvedValue(pantryOf('rice', 'eggs'));
  });

  afterEach(() => getItems.mockRestore());

  it('always carries the profile allergies', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(profile());

    const { user, context } = await buildCallerContext(FREE);

    expect(user).toEqual({ id: 'u-free', subscriptionTier: 'FREE' });
    expect(context.allergies).toEqual(['peanuts']);
    expect(context.dietaryRestrictions).toEqual(['vegetarian']);
    expect(context.healthGoals).toEqual(['WEIGHT_LOSS']);
    expect(context.profileUnavailable).toBeUndefined();
  });

  it('gives a FREE user no pantry, even when the request supplies one', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(profile());

    const { context } = await buildCallerContext(
      FREE,
      readContextAdditions({ pantryNames: ['saffron', 'lobster'] })
    );

    expect(context.pantryNames).toEqual([]);
    expect(context.currentPantryItems).toEqual([]);
    expect(getItems).not.toHaveBeenCalled();
  });

  it('gives a PREMIUM user the stored pantry plus any the request adds', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(profile());

    const { user, context } = await buildCallerContext(PREMIUM, {
      pantryNames: ['Rice', 'lemons'],
    });

    expect(user.subscriptionTier).toBe('PREMIUM');
    expect(getItems).toHaveBeenCalledWith('u-premium', { limit: 50 });
    expect(context.pantryNames).toEqual(['rice', 'eggs', 'lemons']);
    expect(context.currentPantryItems).toEqual([
      'rice (1 pcs)',
      'eggs (1 pcs)',
      'lemons',
    ]);
  });

  it('unions request allergies with the profile and never removes one', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(profile());

    // An empty list is the old attack: spread last, it erased the profile's.
    const emptied = await buildCallerContext(
      FREE,
      readContextAdditions({ allergies: [], dietaryRestrictions: [] })
    );
    expect(emptied.context.allergies).toEqual(['peanuts']);
    expect(emptied.context.dietaryRestrictions).toEqual(['vegetarian']);

    const added = await buildCallerContext(
      FREE,
      readContextAdditions({ allergies: ['Peanuts', 'shellfish'] })
    );
    expect(added.context.allergies).toEqual(['peanuts', 'shellfish']);
  });

  it('ignores anything in a request context it does not honour', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(profile());

    const { context } = await buildCallerContext(
      FREE,
      readContextAdditions({
        allergies: 'peanuts',
        profileUnavailable: false,
        currentPantryItems: ['caviar'],
      })
    );

    expect(context.allergies).toEqual(['peanuts']);
    expect(context.currentPantryItems).toEqual([]);
  });

  it('flags the context when the profile read throws', async () => {
    prismaMock.userProfile.findUnique.mockRejectedValue(
      new Error('connection refused')
    );

    const { context } = await buildCallerContext(
      FREE,
      readContextAdditions({ allergies: ['sesame'] })
    );

    expect(context.profileUnavailable).toBe(true);
    // Nothing from the profile, but what the request added still applies.
    expect(context.allergies).toEqual(['sesame']);
  });

  it('treats a user with no profile row as having declared nothing', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(null);

    const { context } = await buildCallerContext(FREE);

    expect(context.allergies).toEqual([]);
    expect(context.profileUnavailable).toBeUndefined();
  });

  it('degrades to no pantry, not a failed turn, when the pantry read throws', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(profile());
    getItems.mockRejectedValue(new Error('timeout'));

    const { context } = await buildCallerContext(PREMIUM);

    expect(context.pantryNames).toEqual([]);
    expect(context.allergies).toEqual(['peanuts']);
    expect(context.profileUnavailable).toBeUndefined();
  });
});
