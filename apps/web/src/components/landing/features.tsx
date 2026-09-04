'use client';

import { useRouter } from 'next/navigation';

import { SignatureCard } from '@/components/ds';
import { Card } from '@/components/ui/card';

/**
 * The feature band.
 *
 * A coral signature card carries the brand voltage, then a demo grid of flat
 * content cards. Per the system, demo-card heights are deliberately uneven
 * within the grid so it doesn't read as a uniform spec sheet, and no two
 * consecutive bands repeat a surface mode.
 */
const FEATURES = [
  {
    title: 'Invents around your pantry',
    body: 'Petra reads what you actually have, including the things about to turn, and builds the dish around them.',
  },
  {
    title: 'Hands-free at the stove',
    body: 'Cook Mode steps through the method one instruction at a time, with timers and the safety checks spelled out.',
  },
  {
    title: 'Plans the whole week',
    body: 'A week of meals built around your kitchen, with leftovers threaded through and a batch cook on Sunday.',
  },
  {
    title: 'Shopping without duplicates',
    body: 'The list is written around the gaps, skipping anything you already own in a usable quantity.',
  },
];

export function Features() {
  const router = useRouter();

  return (
    <section className="band mx-auto max-w-[1280px] px-lg">
      <SignatureCard
        variant="coral"
        eyebrow="Zero waste"
        title="The average household bins a third of what it buys."
        body="Petra tracks what you use and what you lose, learns where you slip, and starts suggesting those ingredients first. Most people cut their waste in half within a month."
        ctaLabel="See how it works"
        onCta={() => router.push('/features')}
      />

      <div className="mt-section grid gap-lg md:grid-cols-2">
        {FEATURES.map((feature, i) => (
          <Card
            key={feature.title}
            surface={i % 3 === 1 ? 'soft' : 'content'}
            className={i % 3 === 1 ? 'md:mt-xl' : undefined}
          >
            <h3 className="text-title-md font-regular text-foreground">{feature.title}</h3>
            <p className="mt-sm text-body-md text-muted-foreground">{feature.body}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
