/**
 * Cook mode's pure rules, shared by web and mobile.
 */
import { FORM_WORDS, ingredientWords } from '@petra/food-measures';

/** 90 → "1:30", 605 → "10:05". */
export const formatTimer = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
};

/** Keep a step index inside the recipe. */
export const clampStep = (i: number, count: number): number =>
  count <= 0 ? 0 : Math.max(0, Math.min(count - 1, i));

/**
 * Split a stored instruction into the large title and the body cook mode
 * shows. Recipes store one paragraph per step, so the first sentence becomes
 * the title when there is more than one; otherwise the whole thing is the
 * title and there is no body.
 */
export const splitStep = (
  instruction: string
): { title: string; body: string | null } => {
  const text = instruction.trim();
  const m = /^(.+?[.!?])\s+(\S[\s\S]*)$/.exec(text);
  if (!m || m[1].length > 90) return { title: text, body: null };
  return { title: m[1].replace(/[.!]$/, ''), body: m[2] };
};

/**
 * The ingredients a step mentions, in recipe order — cook mode's "For this
 * step" panel. An ingredient counts when any of its significant words appears
 * in the step ("olive oil" in "warm the oil"; "tinned tomatoes" in "add the
 * tomatoes").
 *
 * Words are `ingredientWords` from `@petra/food-measures`, the identity the
 * pantry match uses, so "scallions" in the list finds "spring onions" in the
 * method. Form words ("tinned", "ground") are set aside here: a step says
 * "add the tomatoes", not "add the tinned tomatoes".
 */
export const ingredientsForStep = <T extends { name: string }>(
  step: string,
  ingredients: readonly T[]
): T[] => {
  const inStep = new Set(ingredientWords(step));
  return ingredients.filter(i => {
    const key = ingredientWords(i.name).filter(
      w => !FORM_WORDS.has(w) && w.length > 2
    );
    return key.some(w => inStep.has(w));
  });
};
