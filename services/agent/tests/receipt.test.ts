import { parseReceipt } from '../src/vision/receipt';

const reply = (body: unknown) =>
  `Here you go:\n\`\`\`json\n${JSON.stringify(body)}\n\`\`\``;

describe('parseReceipt', () => {
  it('keeps food lines and normalises what the model sends', () => {
    const r = parseReceipt(
      reply({
        store: 'Northfield Grocers',
        items: [
          {
            name: 'Greek yoghurt',
            category: 'DAIRY',
            quantity: 500,
            unit: 'g',
            expiresInDays: 9.6,
            confidence: 0.9,
          },
          {
            name: 'Eggs',
            category: 'dairy',
            quantity: 6,
            unit: null,
            brand: null,
            confidence: 0.95,
          },
        ],
      })
    );
    expect(r.store).toBe('Northfield Grocers');
    expect(r.items).toEqual([
      {
        name: 'Greek yoghurt',
        category: 'dairy',
        quantity: 500,
        unit: 'g',
        expiresInDays: 10,
        confidence: 0.9,
      },
      { name: 'Eggs', category: 'dairy', quantity: 6, confidence: 0.95 },
    ]);
  });

  it('drops non-food lines even when the model includes them', () => {
    const r = parseReceipt(
      reply({
        items: [
          { name: 'Carrier bag', category: 'other', confidence: 0.9 },
          { name: 'Multibuy saving', category: 'other', confidence: 0.9 },
          { name: 'Bleach', category: 'other', confidence: 0.9 },
          { name: 'Lemons', category: 'produce', confidence: 0.9 },
        ],
      })
    );
    expect(r.items.map(i => i.name)).toEqual(['Lemons']);
  });

  it('drops guesses below the confidence floor', () => {
    const r = parseReceipt(
      reply({
        items: [
          { name: 'Possibly cheese', category: 'dairy', confidence: 0.2 },
        ],
      })
    );
    expect(r.items).toEqual([]);
  });

  it('merges the same item bought twice', () => {
    const r = parseReceipt(
      reply({
        items: [
          { name: 'Milk', category: 'dairy', confidence: 0.9 },
          { name: 'milk', category: 'dairy', confidence: 0.9 },
        ],
      })
    );
    expect(r.items).toHaveLength(1);
  });

  it('falls back to "other" for an unknown category and rejects nameless lines', () => {
    const r = parseReceipt(
      reply({
        items: [
          { name: 'Sourdough', category: 'bakery', confidence: 0.8 },
          { name: '', category: 'produce', confidence: 0.9 },
        ],
      })
    );
    expect(r.items).toEqual([
      { name: 'Sourdough', category: 'other', confidence: 0.8 },
    ]);
  });

  it('returns nothing, rather than throwing, for a reply with no JSON', () => {
    expect(parseReceipt('Sorry, I cannot read that.')).toEqual({ items: [] });
    expect(parseReceipt('{not json')).toEqual({ items: [] });
  });
});
