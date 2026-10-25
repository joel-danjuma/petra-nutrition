import type { AgentContext, AgentUser } from '@petra/agent-contract';

import { prisma } from '../database';
import { PantryService } from './pantry';

/**
 * Everything the agent is told about a user, decided in one place.
 *
 * The agent is stateless with respect to user data, so whatever it knows about
 * the caller is exactly what this module hands it. That used to be assembled
 * separately in every controller that called the agent, and the copies
 * drifted: meal-plan and recipe generation sent `allergies: []` regardless of
 * the profile, and chat spread an unvalidated request body over the server's
 * values, so a client could clear its allergies or claim a pantry on the free
 * tier. Allergies drive the agent's retrieval filter; dropping them is a
 * safety bug, not a cosmetic one.
 *
 * The rules, so they only need stating once:
 * - Allergies, dietary restrictions and health goals come from the profile.
 *   A caller may add to them, never remove from them.
 * - The stored pantry is a premium feature. A caller may name the pantry for
 *   one request instead — the items it typed into a meal-plan form, say — but
 *   cannot get the stored one without the tier.
 */

/** What a caller may contribute on top of the stored profile. */
export interface SuppliedContext {
  /** Replaces the stored pantry for this request. `[]` means "no pantry". */
  pantry?: string[];
  dietaryRestrictions?: string[];
  healthGoals?: string[];
  allergies?: string[];
  activeMealPlan?: string;
  lastRecipeSearch?: string;
}

const PANTRY_LIMIT = 50;

export const agentUser = (user: {
  id: string;
  subscriptionTier?: string | null;
}): AgentUser => ({
  id: user.id,
  subscriptionTier: user.subscriptionTier === 'PREMIUM' ? 'PREMIUM' : 'FREE',
});

const union = (stored: readonly string[] = [], supplied: unknown): string[] => {
  const extra = Array.isArray(supplied)
    ? supplied.filter((s): s is string => typeof s === 'string')
    : [];
  return [...new Set([...stored, ...extra])];
};

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * Narrow an untrusted request body field to the fields a client may supply.
 * Anything else — pantry included — is dropped rather than trusted.
 */
export const fromRequestContext = (raw: unknown): SuppliedContext => {
  if (!raw || typeof raw !== 'object') return {};
  const ctx = raw as Record<string, unknown>;
  return {
    allergies: union([], ctx.allergies),
    dietaryRestrictions: union([], ctx.dietaryRestrictions),
    activeMealPlan: optionalString(ctx.activeMealPlan),
    lastRecipeSearch: optionalString(ctx.lastRecipeSearch),
  };
};

export class AgentContextService {
  constructor(private readonly pantryService = new PantryService()) {}

  /**
   * Build the context for one agent call.
   *
   * A failed profile read propagates instead of degrading to an empty context:
   * an empty context is indistinguishable from "no allergies", and quietly
   * telling the model that is worse than failing the request.
   */
  async forUser(
    userId: string,
    supplied: SuppliedContext = {}
  ): Promise<AgentContext> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    const profile = user?.profile;

    const pantry = await this.pantryFor(
      userId,
      user?.subscriptionTier === 'PREMIUM',
      supplied.pantry
    );

    return {
      userPreferences: profile ?? undefined,
      currentPantryItems: pantry.described,
      pantryNames: pantry.names,
      allergies: union(profile?.allergies, supplied.allergies),
      dietaryRestrictions: union(
        profile?.dietaryRestrictions,
        supplied.dietaryRestrictions
      ),
      healthGoals: union(profile?.healthGoals, supplied.healthGoals),
      activeMealPlan: supplied.activeMealPlan,
      lastRecipeSearch: supplied.lastRecipeSearch,
    };
  }

  private async pantryFor(
    userId: string,
    isPremium: boolean,
    supplied?: string[]
  ): Promise<{ described: string[]; names: string[] }> {
    if (supplied) {
      const names = union([], supplied);
      return { described: names, names };
    }
    if (!isPremium) return { described: [], names: [] };

    const { items } = await this.pantryService.getItems(userId, {
      limit: PANTRY_LIMIT,
    });
    return {
      described: items.map(
        item => `${item.name} (${item.quantity} ${item.unit})`
      ),
      names: items.map(item => item.name),
    };
  }
}

export const agentContext = new AgentContextService();
