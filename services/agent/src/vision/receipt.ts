import {
  receiptItemSchema,
  type ReceiptItem,
  type ReceiptResponse,
} from '@petra/agent-contract';

/**
 * Reading a supermarket receipt into pantry items.
 *
 * The model reads the image; this module decides what to believe. Like
 * `validateEnrichment`, it rejects rather than repairs: a line that does not
 * parse is dropped, not guessed at, because every item here becomes a pantry
 * row someone cooks from. The user reviews the list before anything is saved,
 * so a dropped line costs one manual add — a wrong one costs a recipe.
 */

export const RECEIPT_PROMPT = `You are reading a photo of a grocery receipt.

List the FOOD and DRINK items bought. Ignore everything else: bags, cleaning
products, toiletries, discounts, multibuy lines, totals, payment and loyalty
lines, deposit charges.

For each item give:
- "name": the food as a person would say it ("Greek yoghurt", "Chicken thighs"),
  expanding till abbreviations ("SEMI SKMD MLK" -> "Semi-skimmed milk"). No brand
  in the name.
- "category": one of produce, dairy, meat, seafood, grains, pantry_staples,
  spices, condiments, beverages, frozen, canned, snacks, other
- "brand": only if printed, else omit
- "quantity" and "unit": from the line if shown ("500 g", "1 l", "6"), else omit
- "expiresInDays": typical days until it should be used if kept as sold
  (fresh fish 2, salad 4, milk 7, eggs 21, cheddar 30, frozen 90, tins 365);
  omit for non-perishables you are unsure of
- "confidence": 0 to 1, how sure you are this line is that food

If a line is unreadable, leave it out rather than guess.

Return ONLY JSON: {"store": "store name if printed", "items": [ ... ]}`;

/** Lines that are never food, whatever the model thought. */
const NOT_FOOD =
  /\b(bag|carrier|total|subtotal|discount|saving|voucher|deposit|change|card|cash|vat|points|clubcard|nectar|bleach|detergent|tissue|toilet|shampoo|soap)\b/i;

/** Receipts top out well below this; more means the model is inventing lines. */
const MAX_ITEMS = 80;

/** Below this the model is guessing; leave the line for the user to add. */
const MIN_CONFIDENCE = 0.4;

const CATEGORIES = new Set([
  'produce',
  'dairy',
  'meat',
  'seafood',
  'grains',
  'pantry_staples',
  'spices',
  'condiments',
  'beverages',
  'frozen',
  'canned',
  'snacks',
  'other',
]);

/** Pull the first JSON object out of a model reply that may wrap it in prose or a fence. */
const extractJson = (text: string): unknown => {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
};

export function parseReceipt(modelText: string): ReceiptResponse {
  const raw = extractJson(modelText);
  if (!raw || typeof raw !== 'object') return { items: [] };

  const obj = raw as { items?: unknown; store?: unknown };
  const lines = Array.isArray(obj.items) ? obj.items.slice(0, MAX_ITEMS) : [];

  const seen = new Set<string>();
  const items: ReceiptItem[] = [];
  for (const line of lines) {
    if (!line || typeof line !== 'object') continue;
    const l = line as Record<string, unknown>;

    // Normalise before validating: models send nulls for "absent".
    const candidate = {
      name: typeof l.name === 'string' ? l.name.trim() : '',
      category:
        typeof l.category === 'string' &&
        CATEGORIES.has(l.category.toLowerCase())
          ? l.category.toLowerCase()
          : 'other',
      brand:
        typeof l.brand === 'string' && l.brand.trim()
          ? l.brand.trim()
          : undefined,
      quantity:
        typeof l.quantity === 'number' && l.quantity > 0
          ? l.quantity
          : undefined,
      unit:
        typeof l.unit === 'string' && l.unit.trim() ? l.unit.trim() : undefined,
      expiresInDays:
        typeof l.expiresInDays === 'number' && Number.isFinite(l.expiresInDays)
          ? Math.round(l.expiresInDays)
          : undefined,
      confidence:
        typeof l.confidence === 'number'
          ? Math.max(0, Math.min(1, l.confidence))
          : 0.5,
    };

    const parsed = receiptItemSchema.safeParse(candidate);
    if (!parsed.success) continue;
    if (parsed.data.confidence < MIN_CONFIDENCE) continue;
    if (NOT_FOOD.test(parsed.data.name)) continue;

    // The same thing bought twice is one pantry row, not two.
    const key = parsed.data.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(parsed.data);
  }

  const store =
    typeof obj.store === 'string' && obj.store.trim()
      ? obj.store.trim()
      : undefined;
  return store ? { items, store } : { items };
}
