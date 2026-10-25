/**
 * Cook mode's pure rules, shared by web and mobile.
 */

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

const DESCRIPTORS = new Set([
  'fresh',
  'large',
  'small',
  'ripe',
  'chopped',
  'sliced',
  'diced',
  'minced',
  'grated',
  'crushed',
  'whole',
  'extra',
  'virgin',
  'free',
  'range',
  'of',
  'and',
  'or',
  'the',
  'tin',
  'tins',
  'can',
  'tinned',
  'canned',
  'clove',
  'cloves',
  'bunch',
  'thick',
]);

const stem = (w: string) =>
  w.endsWith('oes') && w.length > 4
    ? w.slice(0, -2)
    : w.endsWith('s') && w.length > 3
      ? w.slice(0, -1)
      : w;

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(stem);

/**
 * The ingredients a step mentions, in recipe order — cook mode's "For this
 * step" panel. An ingredient counts when any of its significant words appears
 * in the step ("olive oil" in "warm the oil"; "tinned tomatoes" in "add the
 * tomatoes").
 */
export const ingredientsForStep = <T extends { name: string }>(
  step: string,
  ingredients: readonly T[]
): T[] => {
  const inStep = new Set(words(step));
  return ingredients.filter(i => {
    const key = words(i.name).filter(w => !DESCRIPTORS.has(w) && w.length > 2);
    return key.some(w => inStep.has(w));
  });
};
