import type { AgentContext, AgentUser } from '@petra/agent-contract';

import { prisma } from '../database';
import { logger } from '../utils/logger';
import { PantryService } from './pantry';

/**
 * Caller context: everything the agent is told about the person asking.
 *
 * This is the only producer of an agent request's `user` and `context`. It used
 * to be assembled by hand at six call sites, and they had drifted: the recipe
 * and meal-plan paths sent `allergies: []` outright, and chat spread the raw
 * request body over the profile, so a client could send `allergies: []` and
 * erase a declared allergy, or a FREE user could send a pantry the tier does
 * not include.
 *
 * The rules, which every caller now gets by construction:
 *
 * - **The profile is the floor.** Allergies, diet and health goals come from
 *   the stored profile, read here with Prisma directly.
 * - **Request additions can only narrow.** Allergies, diets and goals sent with
 *   a request are unioned with the profile's. Nothing a client sends can remove
 *   anything, because there is no code path that subtracts.
 * - **The pantry is a PREMIUM feature**, whether it comes from the database or
 *   from the request. A FREE caller's request pantry is dropped, not trusted.
 * - **A failed profile read is stated, not hidden.** The turn proceeds — a
 *   database hiccup should not cost the user an answer — but with
 *   `profileUnavailable` set, which the agent turns into a visible caveat that
 *   allergies were not checked. The old path caught the error and sent an
 *   empty allergy list as though it were the truth.
 */

/** The authenticated user, as the auth middleware attaches it to `req.user`. */
export interface Caller {
  id: string;
  subscriptionTier: string;
}

/**
 * What a request may add to the stored profile.
 *
 * Deliberately a short list of things that can only make the answer *more*
 * constrained (or, for the pantry, more informed). Anything else in a request
 * body's context is ignored rather than passed through.
 */
export interface ContextAdditions {
  allergies?: string[];
  dietaryRestrictions?: string[];
  healthGoals?: string[];
  /** Item names. Honoured for PREMIUM callers only. */
  pantryNames?: string[];
}

export interface CallerContext {
  user: AgentUser;
  context: AgentContext;
}

/** Bounds on a request-supplied list, so a body cannot stuff the prompt. */
const MAX_ADDITIONS = 50;
const MAX_ADDITION_LENGTH = 80;

/** Same cap the chat path has always used for pantry context. */
const PANTRY_LIMIT = 50;

/** The one place an app tier becomes a wire tier. */
export function agentTier(tier: string): AgentUser['subscriptionTier'] {
  return tier === 'PREMIUM' ? 'PREMIUM' : 'FREE';
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((v): v is string => typeof v === 'string')
    .map(v => v.trim().slice(0, MAX_ADDITION_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_ADDITIONS);
}

/**
 * Pick the honoured additions out of an untyped request body.
 *
 * Controllers receive `req.body` as `any`; this is the boundary where it stops
 * being trusted. Only string arrays under the known keys survive.
 */
export function readContextAdditions(raw: unknown): ContextAdditions {
  if (!raw || typeof raw !== 'object') return {};
  const body = raw as Record<string, unknown>;

  return {
    allergies: stringList(body.allergies),
    dietaryRestrictions: stringList(body.dietaryRestrictions),
    healthGoals: stringList(body.healthGoals),
    pantryNames: stringList(body.pantryNames),
  };
}

/**
 * Union two lists, keeping the first spelling of each entry. Case-insensitive,
 * so a request's "Peanuts" does not sit beside the profile's "peanuts".
 */
function union(base: readonly string[], extra: readonly string[] = []) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of [...base, ...extra]) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

const pantryService = new PantryService();

/**
 * The stored pantry, formatted for the prompt and as bare names for the
 * retrieval overlap signal. A failure costs the pantry, not the turn: unlike
 * allergies, a missing pantry makes an answer less useful, never unsafe.
 */
async function readPantry(userId: string) {
  try {
    const { items } = await pantryService.getItems(userId, {
      limit: PANTRY_LIMIT,
    });
    return {
      described: items.map(
        item => `${item.name} (${item.quantity} ${item.unit})`
      ),
      names: items.map(item => item.name),
    };
  } catch (error) {
    logger.warn('Caller context: pantry unavailable', { userId, error });
    return { described: [], names: [] };
  }
}

async function readProfile(userId: string) {
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
    });
    return { profile, unavailable: false };
  } catch (error) {
    logger.error('Caller context: profile unavailable', { userId, error });
    return { profile: null, unavailable: true };
  }
}

/**
 * Build the agent's `user` and `context` for an authenticated caller.
 *
 * Never throws for a read failure; see the module comment for why a failed
 * profile read degrades to a flagged context instead.
 */
export async function buildCallerContext(
  caller: Caller,
  additions: ContextAdditions = {}
): Promise<CallerContext> {
  const tier = agentTier(caller.subscriptionTier);
  const premium = tier === 'PREMIUM';

  const [{ profile, unavailable }, pantry] = await Promise.all([
    readProfile(caller.id),
    premium ? readPantry(caller.id) : Promise.resolve(null),
  ]);

  // A request pantry joins the stored one rather than replacing it: an item
  // the caller did not mention is still in their cupboard.
  const storedNames = pantry?.names ?? [];
  const pantryNames = premium
    ? union(storedNames, additions.pantryNames)
    : [];
  const storedKeys = new Set(storedNames.map(n => n.trim().toLowerCase()));
  const currentPantryItems = premium
    ? [
        ...(pantry?.described ?? []),
        ...pantryNames.filter(n => !storedKeys.has(n.trim().toLowerCase())),
      ]
    : [];

  const context: AgentContext = {
    userPreferences: profile ?? undefined,
    currentPantryItems,
    pantryNames,
    allergies: union(profile?.allergies ?? [], additions.allergies),
    dietaryRestrictions: union(
      profile?.dietaryRestrictions ?? [],
      additions.dietaryRestrictions
    ),
    healthGoals: union(profile?.healthGoals ?? [], additions.healthGoals),
    ...(unavailable ? { profileUnavailable: true } : {}),
  };

  return { user: { id: caller.id, subscriptionTier: tier }, context };
}
