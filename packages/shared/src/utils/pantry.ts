import type { ItemCategory, StorageLocation } from '../types/enums';

/**
 * Pantry presentation rules shared by web and mobile.
 *
 * Mirrors `pantryItems()` in the redesign prototype (`petra-redesign.dc.html`):
 * items sort by how soon they turn, anything due within three days sits on the
 * cream "use soon" surface, and an item due today is called out in coral.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days until this point, the label stops counting and just says "Stocked". */
export const STOCKED_AFTER_DAYS = 60;

/** Days within which an item is "due soon" — the cream row and the filter. */
export const DUE_SOON_DAYS = 3;

export type PantryUrgency = 'expired' | 'today' | 'soon' | 'later' | 'stocked';

const startOfDay = (d: Date): number =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * Whole calendar days from `now` until `expirationDate`: 0 means it turns
 * today, negative means it already has, and `null` means there is no date.
 *
 * Calendar days, not elapsed time — `getDaysUntilExpiration` rounds a raw
 * millisecond difference, so the same item reads "1 day" in the morning and
 * "0 days" at night.
 */
export const daysLeft = (
  expirationDate: Date | string | null | undefined,
  now: Date = new Date()
): number | null => {
  if (!expirationDate) return null;
  const exp =
    typeof expirationDate === 'string'
      ? new Date(expirationDate)
      : expirationDate;
  if (Number.isNaN(exp.getTime())) return null;
  return Math.round((startOfDay(exp) - startOfDay(now)) / DAY_MS);
};

export const pantryUrgency = (days: number | null): PantryUrgency => {
  if (days === null || days >= STOCKED_AFTER_DAYS) return 'stocked';
  if (days < 0) return 'expired';
  if (days === 0) return 'today';
  if (days <= DUE_SOON_DAYS) return 'soon';
  return 'later';
};

/** The short due label shown on a pantry row: "Use today", "2 days", "Stocked". */
export const dueLabel = (days: number | null): string => {
  switch (pantryUrgency(days)) {
    case 'stocked':
      return 'Stocked';
    case 'expired':
      return 'Past its date';
    case 'today':
      return 'Use today';
    default:
      return days === 1 ? '1 day' : `${days} days`;
  }
};

/** Whether the row sits on the cream "use soon" surface. */
export const isDueSoon = (days: number | null): boolean => {
  const u = pantryUrgency(days);
  return u === 'expired' || u === 'today' || u === 'soon';
};

/**
 * Sort key: soonest first, undated items last. Stable for equal keys, so a
 * caller's secondary order (e.g. by name) survives.
 */
export const byDaysLeft = <T extends { expirationDate?: Date | string | null }>(
  items: readonly T[],
  now: Date = new Date()
): T[] =>
  [...items].sort((a, b) => {
    const da = daysLeft(a.expirationDate, now) ?? Number.POSITIVE_INFINITY;
    const db = daysLeft(b.expirationDate, now) ?? Number.POSITIVE_INFINITY;
    return da - db;
  });

/** The design's storage names. The data model calls the cupboard `PANTRY`. */
export const LOCATION_LABEL: Record<StorageLocation, string> = {
  FRIDGE: 'Fridge',
  FREEZER: 'Freezer',
  PANTRY: 'Cupboard',
};

/* ------------------------------------------------------------ illustrations */

/** The sixteen pantry illustrations, by file stem (`petra-<stem>.svg`). */
export const PANTRY_ART = [
  'avocado',
  'bread-loaf',
  'carrot',
  'eggs',
  'garlic',
  'greens',
  'honey-jar',
  'jam-jar',
  'lemon',
  'milk-bottle',
  'olive-oil',
  'pickle-jar',
  'sauce-bottle',
  'spice-jars',
  'tomato-tin',
  'tomato',
] as const;

export type PantryArt = (typeof PANTRY_ART)[number];

/**
 * Keyword → illustration. Checked in order, so the more specific phrase must
 * come first ("tinned tomato" before "tomato", "olive oil" before "olive").
 * Matched against whole words of the lower-cased item name.
 */
const KEYWORDS: ReadonlyArray<readonly [PantryArt, readonly string[]]> = [
  [
    'tomato-tin',
    [
      'tinned tomato',
      'tinned tomatoes',
      'canned tomato',
      'canned tomatoes',
      'chopped tomatoes',
      'passata',
      'tomato paste',
      'tomato puree',
    ],
  ],
  ['olive-oil', ['olive oil', 'oil', 'vinegar']],
  [
    'sauce-bottle',
    [
      'hot sauce',
      'sauce',
      'ketchup',
      'sriracha',
      'soy',
      'mustard',
      'mayonnaise',
      'mayo',
      'harissa',
    ],
  ],
  [
    'spice-jars',
    [
      'spice',
      'spices',
      'cumin',
      'paprika',
      'chilli',
      'chili',
      'turmeric',
      'cinnamon',
      'black pepper',
      'peppercorns',
      'salt',
      'oregano',
      'thyme',
      'curry',
    ],
  ],
  [
    'pickle-jar',
    [
      'pickle',
      'pickles',
      'gherkin',
      'gherkins',
      'olives',
      'capers',
      'kimchi',
      'sauerkraut',
    ],
  ],
  ['honey-jar', ['honey', 'syrup', 'peanut butter', 'nut butter']],
  ['jam-jar', ['jam', 'marmalade', 'preserve', 'chutney']],
  [
    'milk-bottle',
    ['milk', 'cream', 'yoghurt', 'yogurt', 'kefir', 'buttermilk'],
  ],
  ['eggs', ['egg', 'eggs']],
  [
    'bread-loaf',
    [
      'bread',
      'loaf',
      'baguette',
      'sourdough',
      'bagel',
      'bagels',
      'pitta',
      'pita',
      'flatbread',
      'tortilla',
      'tortillas',
      'wrap',
      'wraps',
      'bun',
      'buns',
      'rolls',
    ],
  ],
  ['garlic', ['garlic', 'onion', 'onions', 'shallot', 'shallots', 'ginger']],
  ['avocado', ['avocado', 'avocados']],
  [
    'lemon',
    [
      'lemon',
      'lemons',
      'lime',
      'limes',
      'orange',
      'oranges',
      'citrus',
      'grapefruit',
    ],
  ],
  [
    'carrot',
    [
      'carrot',
      'carrots',
      'parsnip',
      'parsnips',
      'potato',
      'potatoes',
      'sweet potato',
      'beetroot',
      'swede',
      'turnip',
    ],
  ],
  ['tomato', ['tomato', 'tomatoes', 'pepper', 'peppers', 'chilli pepper']],
  [
    'greens',
    [
      'greens',
      'spinach',
      'kale',
      'lettuce',
      'salad',
      'rocket',
      'chard',
      'cabbage',
      'broccoli',
      'herbs',
      'parsley',
      'coriander',
      'basil',
      'mint',
      'leek',
      'leeks',
      'cucumber',
      'courgette',
      'peas',
      'beans',
    ],
  ],
];

/** When no keyword matches, fall back on the item's category. */
const CATEGORY_ART: Record<ItemCategory, PantryArt> = {
  PRODUCE: 'greens',
  DAIRY: 'milk-bottle',
  MEAT: 'tomato-tin',
  SEAFOOD: 'tomato-tin',
  GRAINS: 'bread-loaf',
  PANTRY_STAPLES: 'olive-oil',
  SPICES: 'spice-jars',
  CONDIMENTS: 'sauce-bottle',
  BEVERAGES: 'milk-bottle',
  FROZEN: 'bread-loaf',
  CANNED: 'tomato-tin',
  SNACKS: 'jam-jar',
  OTHER: 'jam-jar',
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MATCHERS = KEYWORDS.map(
  ([art, words]) =>
    [art, new RegExp(`\\b(?:${words.map(escape).join('|')})\\b`)] as const
);

/** Pick the illustration for a pantry item, by name first and then category. */
export const pantryArtFor = (
  name: string,
  category?: ItemCategory | null
): PantryArt => {
  const n = name.toLowerCase();
  for (const [art, re] of MATCHERS) {
    if (re.test(n)) return art;
  }
  return category ? CATEGORY_ART[category] : 'jam-jar';
};
