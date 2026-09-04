'use client';

import { CreamCallout } from '@/components/ds';

/**
 * The explainer band.
 *
 * Cream is the softer of the system's brand surfaces, so it sits between the
 * coral signature card above and the dark card below without two strong
 * surfaces colliding — the system's rule that no two consecutive bands repeat
 * a surface mode.
 */
const STEPS = [
  {
    n: '01',
    title: 'Tell Petra what you have',
    body: 'Scan a barcode, photograph a shelf, or type it in. Expiry dates come off the label automatically.',
  },
  {
    n: '02',
    title: 'Ask for dinner',
    body: 'Petra builds a dish around what is closest to turning, inside your diet and the time you have.',
  },
  {
    n: '03',
    title: 'Cook it hands-free',
    body: 'One step at a time, with timers and the safety checks spelled out. Your pantry updates as you go.',
  },
];

export function HowItWorks() {
  return (
    <section className="band mx-auto max-w-[1280px] px-lg">
      <div className="mb-xxl max-w-[20ch]">
        <p className="text-caption font-medium uppercase tracking-[0.16px] text-muted-foreground">
          How it works
        </p>
        <h2 className="mt-md text-display-md font-regular text-foreground">
          Three steps, and nothing gets binned.
        </h2>
      </div>

      <div className="grid gap-lg md:grid-cols-3">
        {STEPS.map(step => (
          <div key={step.n}>
            {/* The number is the emphasis, carried by size and colour. */}
            <span className="text-title-lg font-regular text-muted-foreground">{step.n}</span>
            <h3 className="mt-sm text-title-md font-regular text-foreground">{step.title}</h3>
            <p className="mt-sm text-body-md text-muted-foreground">{step.body}</p>
          </div>
        ))}
      </div>

      <CreamCallout
        className="mt-section"
        eyebrow="What it adds up to"
        title="2.4 kg of food saved in an average month."
        body="Petra logs every item you cook before it turns, and every one you lose. The number is yours, not a marketing average — and it is the one that tends to change behaviour."
      />
    </section>
  );
}
