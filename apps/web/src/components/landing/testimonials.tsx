'use client';

import { SignatureCard } from '@/components/ds';

/**
 * The testimonial band.
 *
 * The forest signature card follows cream above, keeping the surface rotation
 * moving. Quotes sit in flat content cards — no star ratings: the system has no
 * rating glyph, forbids Unicode dingbats, and gets emphasis from the words.
 */
const QUOTES = [
  {
    quote:
      'I stopped throwing away herbs. That sounds small until you realise it was happening every single week.',
    name: 'Amara O.',
    detail: 'Cooks for four',
  },
  {
    quote:
      'Cook Mode is the first thing that has ever got my partner cooking. It just tells you the next thing to do.',
    name: 'Tom R.',
    detail: 'Cooks for two',
  },
  {
    quote:
      'The shopping list skipping what I already own is the feature I did not know I needed. No more three jars of harissa.',
    name: 'Priya N.',
    detail: 'Cooks for one',
  },
];

export function Testimonials() {
  return (
    <section className="band mx-auto max-w-[1280px] px-lg">
      <SignatureCard
        variant="forest"
        eyebrow="In practice"
        title="The change people notice first is the bin."
        body="Not the recipes, not the planning — the fact that the food they bought gets eaten."
      />

      <div className="mt-section grid gap-lg md:grid-cols-3">
        {QUOTES.map(q => (
          <figure key={q.name} className="m-0">
            <blockquote className="m-0 text-title-sm font-regular text-foreground">
              {q.quote}
            </blockquote>
            <figcaption className="mt-md text-body-md text-muted-foreground">
              {q.name} · {q.detail}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
