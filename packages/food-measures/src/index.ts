/**
 * Free-text cooking measures.
 *
 * Two jobs, and the split between them is the point:
 *
 *  - `parseMeasure` reads what a human wrote — "800g", "1 clove",
 *    "2 tablespoons", "1 1/2 tbsp", "½ cup", "Dash" — into a number, a unit
 *    and whatever was left over. It came from the recipe importer, which is
 *    where free text arrives in bulk.
 *  - `toGrams` converts that into mass, which is the only unit a nutrition
 *    database can be queried in.
 *
 * Shared by two services because both need the same answer: the API's importer
 * writes `amount`/`unit` onto every ingredient row, and the agent's nutrition
 * node has to turn those back into grams to look up macros. Two copies of this
 * logic means the recipe screen and the macro panel can disagree about the same
 * dish, which is precisely the bug that is hardest to notice and worst to have.
 *
 * Nothing here estimates. A measure it cannot read comes back as unparsed
 * rather than as a confident guess, and the caller decides what to do about it
 * — usually asking a model for the one number it genuinely cannot derive, and
 * labelling the result accordingly.
 */

export interface ParsedMeasure {
  amount: number;
  unit: string;
  /** Preparation detail or a qualitative measure, kept rather than dropped. */
  notes?: string;
  /** False when no number could be read — "Dash", "To taste", "Pinch". */
  quantified: boolean;
}

const VULGAR: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅙': 1 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

const UNITS =
  /^(g|gram|grams|kg|ml|l|litre|litres|liter|liters|oz|lb|lbs|cup|cups|tbsp|tbs|tablespoon|tablespoons|tsp|teaspoon|teaspoons|clove|cloves|can|cans|tin|tins|slice|slices|sprig|sprigs|pinch|handful|bunch|packet|pack|sheet|sheets|stick|sticks|piece|pieces|fillet|fillets|breast|breasts|thigh|thighs|head|heads|stalk|stalks|rasher|rashers|bulb|bulbs)\b/i;

/**
 * Pull a number and a unit out of a free-text measure.
 *
 * Anything that isn't a quantity — "Dash", "To taste" — comes back with
 * `quantified: false` and the original text preserved in `notes`. An amount of
 * 1 is returned alongside so a caller that just wants to render something has a
 * value, but `quantified` is the field that decides whether the number means
 * anything.
 */
export function parseMeasure(raw: string): ParsedMeasure {
  const text = (raw || '').trim();
  if (!text) return { amount: 1, unit: '', quantified: false };

  let rest = text;
  let amount = 0;
  let matched = false;

  // Leading mixed number / fraction / decimal / vulgar fraction.
  const mixed = rest.match(/^(\d+)\s+(\d+)\/(\d+)\s*/);
  const frac = rest.match(/^(\d+)\/(\d+)\s*/);
  const dec = rest.match(/^(\d+(?:\.\d+)?)\s*/);
  const vulgar = rest.match(/^([½⅓⅔¼¾⅕⅙⅛⅜⅝⅞])\s*/);

  if (mixed) {
    amount = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    rest = rest.slice(mixed[0].length);
    matched = true;
  } else if (frac) {
    amount = Number(frac[1]) / Number(frac[2]);
    rest = rest.slice(frac[0].length);
    matched = true;
  } else if (dec) {
    amount = Number(dec[1]);
    rest = rest.slice(dec[0].length);
    matched = true;
    // "800g" — unit glued to the number.
    const glued = rest.match(/^(g|kg|ml|l|oz|lb|lbs)\b/i);
    if (glued) return { amount, unit: glued[1].toLowerCase(), quantified: true };
  } else if (vulgar) {
    amount = VULGAR[vulgar[1]];
    rest = rest.slice(vulgar[0].length);
    matched = true;
  }

  if (!matched) {
    // "Dash", "To taste", "Pinch" — a qualitative measure, not a quantity.
    return { amount: 1, unit: '', notes: text, quantified: false };
  }

  rest = rest.trim();
  if (!rest) return { amount, unit: '', quantified: true };

  // First token is the unit if it looks like one; the remainder is preparation
  // detail ("1 small finely diced" → 1, unit "", note "small finely diced").
  const unitMatch = rest.match(UNITS);
  if (unitMatch) {
    const notes = rest.slice(unitMatch[0].length).trim();
    return {
      amount,
      unit: unitMatch[1].toLowerCase(),
      quantified: true,
      ...(notes ? { notes } : {}),
    };
  }
  return { amount, unit: '', notes: rest, quantified: true };
}

/* ------------------------------------------------------------ to grams */

/**
 * Units that are already mass, and what one of them weighs in grams — every
 * spelling the importer and the shopping list have met, at the precise factor.
 */
const MASS_G: Record<string, number> = {
  g: 1, gram: 1, grams: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
  lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592,
};

/**
 * Volume units in millilitres.
 *
 * Converted to grams through the ingredient's density, below. UK/metric
 * conventions throughout — a cup is 240ml and a tablespoon 15ml, which is what
 * the recipe corpus this runs on uses. Cups sit here: a cup of milk is milk to
 * buy. Spoons are their own family, below.
 */
const VOLUME_ML: Record<string, number> = {
  ml: 1, millilitre: 1, millilitres: 1, milliliter: 1, milliliters: 1,
  l: 1000, litre: 1000, litres: 1000, liter: 1000, liters: 1000,
  cup: 240, cups: 240,
  'fl oz': 29.5735,
};

/**
 * Spoon measures, in teaspoons, and a teaspoon is 5ml.
 *
 * A family of their own because a shopper adds tablespoons to teaspoons, not
 * to litres: 2 tbsp + 4 tsp is "3.5 tbsp", not "50 ml". `toGrams` still reads
 * them as volume.
 */
const SPOON_TSP: Record<string, number> = {
  tsp: 1, teaspoon: 1, teaspoons: 1,
  tbsp: 3, tbs: 3, tablespoon: 3, tablespoons: 3,
};

const ML_PER_TSP = 5;

/** Bare counts, however they are spelled. */
const COUNT = new Set([
  '', 'pcs', 'pc', 'piece', 'pieces', 'whole', 'each', 'x', 'item', 'items',
]);

/** "Tbsp." and " tbsp" are one unit. */
const normUnit = (unit: string) =>
  (unit || '').trim().toLowerCase().replace(/\.$/, '');

/** Millilitres in one of a volume or spoon unit; undefined for anything else. */
const mlPer = (unit: string): number | undefined => {
  const u = normUnit(unit);
  if (VOLUME_ML[u] !== undefined) return VOLUME_ML[u];
  if (SPOON_TSP[u] !== undefined) return SPOON_TSP[u] * ML_PER_TSP;
  return undefined;
};

/**
 * Grams per millilitre, by ingredient keyword.
 *
 * Only the cases where water's 1.0 is badly wrong. A cup of flour at 1g/ml
 * would be 240g rather than the ~125g it actually is — nearly double the
 * carbohydrate, which is exactly the kind of error that makes a macro panel
 * worse than no macro panel.
 */
const DENSITY_G_PER_ML: Array<[RegExp, number]> = [
  [/\bflour\b/i, 0.53],
  [/\b(sugar|caster|granulated)\b/i, 0.85],
  [/\b(oil|olive oil|vegetable oil)\b/i, 0.92],
  [/\bhoney\b|\bsyrup\b|\btreacle\b/i, 1.42],
  [/\b(butter|margarine)\b/i, 0.91],
  [/\b(rice|lentil|quinoa|couscous|bulgur)\b/i, 0.85],
  [/\b(oat|oats|breadcrumb|breadcrumbs)\b/i, 0.4],
  [/\bsalt\b/i, 1.2],
  [/\b(cream|yoghurt|yogurt)\b/i, 1.01],
  [/\b(cheese|parmesan|cheddar)\b/i, 0.45],
];

/**
 * Typical weight of one of a countable thing, in grams.
 *
 * This is the list that keeps a model out of the arithmetic. "2 chicken
 * breasts" is a real measure a cook writes and a nutrition database cannot
 * answer, and the choice is between a table like this one and asking a model to
 * multiply. The table is checkable and identical on every run; the model is
 * neither.
 *
 * Longest key wins, so "chicken breast" beats "chicken".
 */
const UNIT_WEIGHTS_G: Record<string, number> = {
  'chicken breast': 174,
  'chicken thigh': 116,
  'chicken drumstick': 90,
  'salmon fillet': 170,
  'cod fillet': 180,
  'steak': 225,
  'pork chop': 185,
  'sausage': 60,
  'rasher of bacon': 25,
  'bacon rasher': 25,
  'egg': 50,
  'garlic clove': 3,
  'clove of garlic': 3,
  'onion': 150,
  'red onion': 130,
  'shallot': 30,
  'bell pepper': 150,
  'pepper': 150,
  'tomato': 120,
  'cherry tomato': 17,
  'potato': 170,
  'sweet potato': 180,
  'carrot': 60,
  'courgette': 200,
  'zucchini': 200,
  'aubergine': 300,
  'eggplant': 300,
  'mushroom': 20,
  'lemon': 100,
  'lime': 65,
  'orange': 130,
  'apple': 180,
  'banana': 120,
  'avocado': 150,
  'celery stalk': 40,
  'spring onion': 15,
  'chilli': 15,
  'chili': 15,
  'bay leaf': 0.2,
  'slice of bread': 35,
  'tortilla': 45,
  'can': 400,
  'tin': 400,
  'sprig': 2,
  'handful': 30,
  'bunch': 70,
  'pinch': 0.4,
  'dash': 1,
  'stick of butter': 113,
};

export interface GramsResult {
  grams: number | null;
  /**
   * How it was worked out. `unresolved` means the caller must decide — ask a
   * model for a weight, or report the ingredient as uncounted. It must never be
   * treated as zero.
   */
  basis: 'mass' | 'volume' | 'count' | 'unresolved';
  /** Set when a density or a unit weight was applied, for the audit trail. */
  assumption?: string;
}

const density = (ingredient: string): number => {
  for (const [pattern, value] of DENSITY_G_PER_ML) {
    if (pattern.test(ingredient)) return value;
  }
  return 1;
};

/**
 * Look up the weight of one of something, most specific match first.
 *
 * Matched word by word rather than as a substring, because the unit and the
 * ingredient arrive in either order: a recipe row can say `3 cloves` of
 * `garlic` or `3` of `garlic cloves`, and a substring test only catches one of
 * them. Keys with more words are tried first, so "chicken breast" beats
 * "chicken" and "cherry tomato" beats "tomato".
 *
 * One known imprecision: a bare count of a spice — "1 black pepper" — matches
 * the `pepper` key and comes back as 150g. That is not a measure anyone writes,
 * and spices reach `toGrams` through the volume route (tsp, tbsp), which is
 * checked first.
 */
export function unitWeightFor(ingredient: string): { grams: number; key: string } | null {
  const words = ingredient.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (!words.length) return null;

  const keys = Object.keys(UNIT_WEIGHTS_G).sort((a, b) => {
    const byWords = b.split(' ').length - a.split(' ').length;
    return byWords !== 0 ? byWords : b.length - a.length;
  });

  for (const key of keys) {
    const keyWords = key.split(/[^a-z]+/).filter(Boolean);
    // A key word matches a name word by prefix, so "cloves" satisfies "clove"
    // and "tomatoes" satisfies "tomato" without needing a stemmer.
    const matched = keyWords.every(kw => words.some(w => w.startsWith(kw) || kw.startsWith(w)));
    if (matched) return { grams: UNIT_WEIGHTS_G[key], key };
  }

  return null;
}

/**
 * Convert one ingredient line into grams.
 *
 * Three routes, tried in order of how much they assume: mass units convert
 * exactly, volume units need a density, and a bare count needs a typical
 * weight. Each route records what it assumed, so a figure derived from "a bell
 * pepper is about 150g" says so rather than presenting itself as measured.
 */
export function toGrams(
  ingredient: string,
  amount: number,
  unit: string
): GramsResult {
  const key = normUnit(unit);

  if (!Number.isFinite(amount) || amount <= 0) {
    return { grams: null, basis: 'unresolved' };
  }

  if (MASS_G[key] !== undefined) {
    return { grams: amount * MASS_G[key], basis: 'mass' };
  }

  const ml = mlPer(key);
  if (ml !== undefined) {
    const d = density(ingredient);
    return {
      grams: amount * ml * d,
      basis: 'volume',
      ...(d !== 1 ? { assumption: `${ingredient} at ${d} g/ml` } : {}),
    };
  }

  // A count, with or without a counting noun: "2 chicken breasts",
  // "3 cloves garlic", "1 onion".
  const countable = `${key} ${ingredient}`.trim();
  const weight = unitWeightFor(countable);
  if (weight) {
    return {
      grams: amount * weight.grams,
      basis: 'count',
      assumption: `one ${weight.key} at about ${weight.grams}g`,
    };
  }

  return { grams: null, basis: 'unresolved' };
}

/**
 * Best-effort weight of a quantity, in grams, or null when it cannot be
 * worked out. `toGrams` without the audit trail, for callers that only want
 * the number — a waste log's "about 300g of onions".
 */
export function estimateGrams(
  name: string,
  quantity: number,
  unit: string
): number | null {
  return toGrams(name, quantity, unit).grams;
}

/* ------------------------------------------------------ quantity arithmetic */

export interface Quantity {
  quantity: number;
  unit: string;
}

/**
 * Which kind of measure a unit is. `other` is a counting noun that is not a
 * bare count — "cloves", "bunch", "tins" — and only meets the same noun.
 */
export type UnitFamily = 'mass' | 'volume' | 'spoon' | 'count' | 'other';

export function unitFamily(unit: string): UnitFamily {
  const u = normUnit(unit);
  if (MASS_G[u] !== undefined) return 'mass';
  if (VOLUME_ML[u] !== undefined) return 'volume';
  if (SPOON_TSP[u] !== undefined) return 'spoon';
  if (COUNT.has(u)) return 'count';
  return 'other';
}

/** "cloves" and "clove" are one unit; so are "Tbsp." and "tbsp". */
export function unitKey(unit: string): string {
  const u = normUnit(unit);
  return u.length > 3 && u.endsWith('s') ? u.slice(0, -1) : u;
}

const round = (n: number) => Math.round(n * 100) / 100;
const half = (n: number) => Math.round(n * 2) / 2;

/** A weight or a liquid total, in the unit a shopper would use. */
const present = (family: 'mass' | 'volume', base: number): Quantity =>
  family === 'mass'
    ? base >= 1000
      ? { quantity: round(base / 1000), unit: 'kg' }
      : { quantity: Math.round(base), unit: 'g' }
    : base >= 1000
      ? { quantity: round(base / 1000), unit: 'l' }
      : { quantity: Math.round(base), unit: 'ml' };

/** Spoons stay spoons: 2 tbsp + 4 tsp is "3.5 tbsp", not "50 ml". */
const presentSpoons = (tsp: number): Quantity =>
  tsp >= 3
    ? { quantity: half(tsp / 3), unit: 'tbsp' }
    : { quantity: half(tsp) || round(tsp), unit: 'tsp' };

/**
 * Two quantities of one item on a common scale, or null when they have none.
 *
 * Exact where the units allow it — weights with weights, liquids with liquids,
 * spoons with spoons, counts with counts, the same counting noun with itself.
 * A weight and a liquid meet in grams through the ingredient's density, the
 * conversion the nutrition panel uses, and so do a count and a weight when the
 * item has a known typical weight ("12 leeks" and "4 kg"). Anything else —
 * "24 garlic" and "76 cloves" — has no honest common scale.
 */
function commonScale(
  name: string,
  a: Quantity,
  b: Quantity
): { a: number; b: number; show: (n: number) => Quantity } | null {
  const fa = unitFamily(a.unit);
  const fb = unitFamily(b.unit);
  const ua = normUnit(a.unit);
  const ub = normUnit(b.unit);

  if (fa === 'spoon' && fb === 'spoon') {
    return {
      a: a.quantity * SPOON_TSP[ua],
      b: b.quantity * SPOON_TSP[ub],
      show: presentSpoons,
    };
  }
  if (fa === 'mass' && fb === 'mass') {
    return {
      a: a.quantity * MASS_G[ua],
      b: b.quantity * MASS_G[ub],
      show: n => present('mass', n),
    };
  }
  if (fa === 'volume' && fb === 'volume') {
    return {
      a: a.quantity * VOLUME_ML[ua],
      b: b.quantity * VOLUME_ML[ub],
      show: n => present('volume', n),
    };
  }
  if (
    (fa === 'count' && fb === 'count') ||
    unitKey(a.unit) === unitKey(b.unit)
  ) {
    return {
      a: a.quantity,
      b: b.quantity,
      show: n => ({ quantity: round(n), unit: a.unit || b.unit }),
    };
  }

  const weighable = (f: UnitFamily) => f === 'mass' || f === 'volume';
  if (
    (weighable(fa) && weighable(fb)) ||
    (fa === 'mass' && fb === 'count') ||
    (fa === 'count' && fb === 'mass')
  ) {
    const ga = toGrams(name, a.quantity, a.unit).grams;
    const gb = toGrams(name, b.quantity, b.unit).grams;
    if (ga !== null && gb !== null) {
      return { a: ga, b: gb, show: n => present('mass', n) };
    }
  }

  return null;
}

/**
 * Add two quantities of the same item.
 *
 * On their common scale where they have one. Where they do not, the first
 * quantity is kept and the other comes back as `extra`, shown as a note rather
 * than converted into a number nobody shops by.
 */
export function addQuantities(
  name: string,
  a: Quantity,
  b: Quantity
): Quantity & { extra?: string } {
  const scale = commonScale(name, a, b);
  if (scale) return scale.show(scale.a + scale.b);
  return { ...a, extra: `${round(b.quantity)} ${b.unit}`.trim() };
}

/**
 * How much of `need` is left to buy once `have` is used: 1.3 kg needed with
 * 500 g in the cupboard leaves 800 g. Never below zero — a zero quantity means
 * the cupboard covers it.
 *
 * `incomparable` when the two have no common scale — 2 tins against 400 g,
 * 3 cloves against a bulb — and the caller must not read that as covered.
 * Subtracting the bare numbers is how 1.3 kg minus 500 g became negative and
 * the flour fell off the shopping list.
 */
export function subtractQuantity(
  need: Quantity,
  have: Quantity,
  name = ''
): Quantity | 'incomparable' {
  const scale = commonScale(name, need, have);
  if (!scale) return 'incomparable';
  const left = scale.a - scale.b;
  if (left <= 0) return { quantity: 0, unit: need.unit };
  return scale.show(left);
}

export * from './ingredients';
