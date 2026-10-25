import type { PantryArt } from '@petra/shared';

/**
 * Marketing copy and claims, kept in one place.
 *
 * REVIEW BEFORE LAUNCH. Everything below that states a fact about the world —
 * press mentions, testimonials, headline figures, prices — came from the
 * redesign prototype (`petra-redesign.dc.html`) and the design system's sample
 * content. None of it is sourced from real customers, coverage or measured
 * usage. Replace or remove each item once there is something true to say.
 */

/** Publications in the "Written about in" strip. Sample names, not real coverage. */
export const PRESS = [
  'Verdant Market',
  'Northfield Grocers',
  'Bright Table Media',
  'Form Weekly',
  'Cedarline Wellness',
] as const;

/** Headline figures under the hero. Illustrative until measured. */
export const HEADLINE_STATS = [
  {
    value: '8 sec',
    body: 'from asking to a complete recipe, written for what is in your kitchen.',
  },
  {
    value: '1 photo',
    body: 'to log a whole shelf. Petra reads the items and their dates off the labels.',
  },
  {
    value: '0 to buy',
    body: 'for most suggestions, because every recipe starts from what you already own.',
  },
] as const;

/** Testimonials. Sample quotes — the same three the previous site carried. */
export const TESTIMONIALS = [
  {
    quote:
      'I type what is in the fridge and get a proper recipe back. It has replaced three cookbooks and a lot of scrolling.',
    name: 'Amara O.',
    detail: 'cooks for four',
  },
  {
    quote:
      'Cook mode is the first thing that has ever got my partner cooking. It just tells you the next thing to do.',
    name: 'Tom R.',
    detail: 'cooks for two',
  },
  {
    quote:
      'The list skipping what I already own is the feature I did not know I needed. No more three jars of harissa.',
    name: 'Priya N.',
    detail: 'cooks for one',
  },
] as const;

/**
 * Prices. Billing is not wired up yet (the Stripe webhook is a stub), so these
 * are display-only. The previous site showed $9/month; the redesign shows
 * £4.99. Confirm before launch.
 */
export const PRICING = {
  currency: '£',
  premium: {
    monthly: {
      price: '£4.99',
      period: 'per month',
      note: 'Cancel from the app, any time.',
    },
    annual: {
      price: '£49.90',
      period: 'per year',
      note: 'Two months free, billed once a year.',
    },
  },
} as const;

/**
 * What each tier includes. This must match what the API enforces
 * (`requirePremium` in services/api/src/routes): pantry and shopping lists are
 * Premium-only today, and Free meal plans are capped at one day
 * (`MealPlanController.generate`). The redesign shows pantry and barcode
 * scanning as free — that is a product decision, and changing it here without
 * changing the API would sell something the app refuses.
 */
export type Inclusion = boolean | string;
export const FEATURE_MATRIX: ReadonlyArray<{
  feature: string;
  free: Inclusion;
  premium: Inclusion;
}> = [
  { feature: 'Recipe generation from your pantry', free: true, premium: true },
  { feature: 'Hands-free cook mode', free: true, premium: true },
  { feature: 'Meal plans', free: '1 day', premium: 'Full week' },
  { feature: 'Pantry with expiry tracking', free: false, premium: true },
  { feature: 'Barcode scanning', free: false, premium: true },
  { feature: 'Camera and receipt logging', free: false, premium: true },
  {
    feature: 'Shopping lists that skip what you own',
    free: false,
    premium: true,
  },
  { feature: 'Monthly waste report', free: false, premium: true },
];

export const PRICING_FAQ = [
  {
    q: 'Do I need a card for Free?',
    a: 'No. Free stays free, with no trial that runs out.',
  },
  {
    q: 'What happens to my pantry if I cancel?',
    a: 'It stays. You drop back to Free and keep everything you have logged.',
  },
  {
    // Not enforced anywhere yet — accounts are single-user. Confirm or remove.
    q: 'Is there a household plan?',
    a: 'One Premium account covers everyone who shares the kitchen, up to six people.',
  },
] as const;

/** The pantry illustration wall on Home and Platform. */
export const PANTRY_WALL: ReadonlyArray<{ art: PantryArt; label: string }> = [
  { art: 'tomato', label: 'Tomatoes' },
  { art: 'carrot', label: 'Carrots' },
  { art: 'avocado', label: 'Avocado' },
  { art: 'lemon', label: 'Lemons' },
  { art: 'greens', label: 'Greens' },
  { art: 'garlic', label: 'Garlic' },
  { art: 'eggs', label: 'Eggs' },
  { art: 'milk-bottle', label: 'Milk' },
  { art: 'bread-loaf', label: 'Bread' },
  { art: 'olive-oil', label: 'Olive oil' },
  { art: 'tomato-tin', label: 'Tinned tomatoes' },
  { art: 'spice-jars', label: 'Spices' },
  { art: 'sauce-bottle', label: 'Hot sauce' },
  { art: 'pickle-jar', label: 'Pickles' },
  { art: 'honey-jar', label: 'Honey' },
  { art: 'jam-jar', label: 'Jam' },
];
