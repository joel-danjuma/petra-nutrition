import type { GeneratedRecipe, NutritionFacts } from '@petra/agent-contract';

import { FOOD_TOKENS, licensedTokens, normalise } from '../retrieval/terms';
import {
  blockedTermsIn,
  isAllowedIngredient,
  isStaple,
  unknownTokensIn,
  type Constraints,
} from './constraints';

/**
 * Check a composed dish. Code, not a model.
 *
 * Modelled directly on `validateEnrichment`: reject, don't repair. A repair
 * pass has to decide what the model *meant*, and a wrong guess about an
 * ingredient list is exactly the kind of confident error that ends up on
 * screen. Rejecting is cheap — the specific violations go back to the model,
 * which gets one bounded retry, and if that also fails the turn degrades with
 * the compromise said out loud.
 *
 * "One retry" is deliberate. A loop that keeps retrying until it passes turns a
 * 3-second turn into a 30-second one and burns a daily token budget on a model
 * that has already demonstrated it can't satisfy the constraint.
 */

export type ValidationKind =
  | 'malformed'
  | 'blocked-ingredient'
  | 'out-of-set-ingredient'
  | 'phantom-ingredient'
  | 'unused-ingredient'
  | 'bad-quantity'
  | 'bad-steps'
  | 'bad-yield'
  | 'implausible-macros';

export interface ValidationFailure {
  kind: ValidationKind;
  /** Fed back to the model verbatim on retry, so it must be specific. */
  message: string;
  /**
   * A violation that must never be relaxed, however the retry goes. An allergen
   * in the output is not a quality problem to be traded off against having an
   * answer — there is no acceptable degraded version of it.
   */
  safety?: boolean;
}

export type ValidationResult =
  | { ok: true; recipe: GeneratedRecipe }
  | { ok: false; failures: ValidationFailure[] };

/**
 * The same bounds `validateEnrichment` uses, and for the same reason: these are
 * per-serving figures for a single dish, and anything outside this range is a
 * unit error or a hallucination rather than an unusual meal.
 */
const MACRO_BOUNDS = { calories: 3000, protein: 300, carbs: 500, fat: 300 };

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/* --------------------------------------------------------------- the recipe */

export function validateGeneratedRecipe(
  raw: unknown,
  constraints: Constraints
): ValidationResult {
  const failures: ValidationFailure[] = [];
  const d = raw as Record<string, unknown> | null;

  if (!d || typeof d !== 'object' || Array.isArray(d)) {
    return { ok: false, failures: [{ kind: 'malformed', message: 'Reply was not a JSON object.' }] };
  }

  const title = str(d.title);
  if (title.length < 3) {
    failures.push({ kind: 'malformed', message: 'Missing a dish title.' });
  }

  /* --- ingredients ---------------------------------------------------- */

  const rawIngredients = Array.isArray(d.ingredients) ? d.ingredients : [];
  if (!rawIngredients.length) {
    return {
      ok: false,
      failures: [...failures, { kind: 'malformed', message: 'The ingredients array is empty.' }],
    };
  }

  const ingredients: GeneratedRecipe['ingredients'] = [];

  for (const entry of rawIngredients) {
    const item = (entry ?? {}) as Record<string, unknown>;
    const name = str(item.name);
    if (!name) {
      failures.push({ kind: 'malformed', message: 'An ingredient has no name.' });
      continue;
    }

    // Safety before usefulness. Checked against the same expanded term lists
    // retrieval filters on, not against the prompt's wording.
    const blocked = blockedTermsIn(name, constraints.blockedTokens);
    if (blocked.length) {
      failures.push({
        kind: 'blocked-ingredient',
        safety: true,
        message:
          `"${name}" is excluded for this user (matched: ${blocked.join(', ')}). ` +
          `Remove it entirely — do not substitute a variant of the same thing.`,
      });
      continue;
    }

    if (!isAllowedIngredient(name, constraints)) {
      const unknown = unknownTokensIn(name, constraints);
      failures.push({
        kind: 'out-of-set-ingredient',
        message:
          `"${name}" is not available${unknown.length ? ` (${unknown.join(', ')})` : ''}. ` +
          `Use only the ingredients listed as available, plus the staples.`,
      });
      continue;
    }

    // A quantity that can't be read can't be scaled, shopped or costed, and it
    // can't be turned into macros — which is the whole nutrition path.
    const amount = num(item.amount);
    if (amount === null || amount === 0) {
      failures.push({
        kind: 'bad-quantity',
        message: `"${name}" has no usable amount. Give a number and a unit.`,
      });
      continue;
    }

    ingredients.push({
      name,
      amount,
      unit: str(item.unit),
      ...(str(item.notes) ? { notes: str(item.notes) } : {}),
      staple: isStaple(name),
    });
  }

  /* --- method --------------------------------------------------------- */

  const rawSteps = Array.isArray(d.instructions) ? d.instructions : [];
  const instructions: GeneratedRecipe['instructions'] = [];

  rawSteps.forEach((entry, i) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const instruction = str(item.instruction);
    if (instruction.length < 10) {
      failures.push({
        kind: 'bad-steps',
        message: `Step ${i + 1} is empty or too short to follow.`,
      });
      return;
    }
    const duration = num(item.duration);
    instructions.push({
      step: i + 1,
      instruction,
      ...(duration !== null ? { duration: Math.round(duration) } : {}),
      ...(str(item.tip) ? { tip: str(item.tip) } : {}),
    });
  });

  if (instructions.length < 2) {
    failures.push({
      kind: 'bad-steps',
      message: 'A method needs at least two ordered steps.',
    });
  }

  /* --- method references the ingredients it has, and nothing else ------ */

  if (ingredients.length && instructions.length) {
    const licensed = licensedTokens(ingredients.map(i => i.name));
    const method = instructions.map(s => s.instruction).join(' ');

    const phantom = new Set<string>();
    const blockedInMethod = new Set<string>();

    for (const token of normalise(method)) {
      if (constraints.blockedTokens.has(token)) {
        blockedInMethod.add(token);
        continue;
      }
      // Only closed-vocabulary food words are judged. An unrecognised word is
      // ignored rather than guessed at — over-flagging rejects good recipes.
      if (!FOOD_TOKENS.has(token)) continue;
      if (licensed.has(token)) continue;
      if (isStaple(token)) continue;
      phantom.add(token);
    }

    if (blockedInMethod.size) {
      failures.push({
        kind: 'blocked-ingredient',
        safety: true,
        message:
          `The method mentions ${[...blockedInMethod].join(', ')}, which is excluded ` +
          `for this user. Rewrite the steps without it.`,
      });
    }

    if (phantom.size) {
      failures.push({
        kind: 'phantom-ingredient',
        message:
          `The method uses ${[...phantom].join(', ')}, which is not in the ingredient ` +
          `list. Every ingredient a step calls for must be listed with an amount.`,
      });
    }

    // The other direction: an ingredient nothing ever does anything with is a
    // padded list, and the reader finds out at the sink.
    const methodTokens = new Set(normalise(method));
    const unused = ingredients
      .filter(i => !i.staple)
      .filter(i => {
        const tokens = normalise(i.name);
        return tokens.length > 0 && !tokens.some(t => methodTokens.has(t));
      })
      .map(i => i.name);

    if (unused.length) {
      failures.push({
        kind: 'unused-ingredient',
        message:
          `${unused.join(', ')} ${unused.length === 1 ? 'is' : 'are'} listed but never ` +
          `used in the method. Either use them or drop them.`,
      });
    }
  }

  /* --- yield ---------------------------------------------------------- */

  const servings = num(d.servings);
  if (servings === null || !Number.isInteger(servings) || servings < 1 || servings > 12) {
    failures.push({
      kind: 'bad-yield',
      message: 'Servings must be a whole number between 1 and 12.',
    });
  }

  const prepTime = num(d.prepTime) ?? 0;
  const cookTime = num(d.cookTime) ?? 0;
  if (prepTime > 480 || cookTime > 1440) {
    failures.push({ kind: 'bad-yield', message: 'The prep or cook time is implausible.' });
  }

  const difficulty = str(d.difficulty).toUpperCase();
  const validDifficulty = ['EASY', 'MEDIUM', 'HARD'].includes(difficulty)
    ? (difficulty as GeneratedRecipe['difficulty'])
    : 'MEDIUM';

  if (failures.length) return { ok: false, failures };

  return {
    ok: true,
    recipe: {
      title,
      ...(str(d.description) ? { description: str(d.description) } : {}),
      cuisine: str(d.cuisine) || null,
      servings: servings as number,
      prepTime: Math.round(prepTime),
      cookTime: Math.round(cookTime),
      difficulty: validDifficulty,
      ingredients,
      instructions,
      ...(str(d.safetyNote) ? { safetyNote: str(d.safetyNote) } : {}),
      ...(str(d.zeroWasteNote) ? { zeroWasteNote: str(d.zeroWasteNote) } : {}),
      inspiredBy: Array.isArray(d.inspiredBy)
        ? d.inspiredBy.filter((x): x is string => typeof x === 'string')
        : [],
    },
  };
}

/* ------------------------------------------------------------- the macros */

/**
 * The plausibility gate on macros, wherever they came from.
 *
 * The nutrition node computes these by arithmetic over database rows, so a
 * failure here means a quantity was misread by an order of magnitude — 800g of
 * salt rather than 800mg — not that the model invented a number. Either way it
 * must not reach a screen.
 */
export function validateNutrition(facts: NutritionFacts): ValidationFailure[] {
  const failures: ValidationFailure[] = [];

  for (const key of ['calories', 'protein', 'carbs', 'fat'] as const) {
    const value = num(facts[key]);
    if (value === null) {
      failures.push({ kind: 'implausible-macros', message: `Missing ${key}.` });
      continue;
    }
    if (value > MACRO_BOUNDS[key]) {
      failures.push({
        kind: 'implausible-macros',
        message: `${key} of ${Math.round(value)} per serving is implausible.`,
      });
    }
  }

  return failures;
}

/** One block of feedback for the retry, ordered so safety reads first. */
export function feedbackFor(failures: ValidationFailure[]): string {
  const ordered = [...failures].sort((a, b) => Number(!!b.safety) - Number(!!a.safety));
  return ordered.map(f => `- ${f.message}`).join('\n');
}
