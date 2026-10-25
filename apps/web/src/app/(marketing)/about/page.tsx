import type { Metadata } from 'next';
import Link from 'next/link';

import { PantryArt } from '@/components/ds';
import { PANTRY_WALL } from '@/components/marketing/content';
import { PageIntro, Section } from '@/components/marketing/section';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'About',
  description: 'We started with a full fridge and nothing to cook.',
};

const PRINCIPLES = [
  [
    'The pantry comes first',
    'Every recipe starts from what you own. When Petra does suggest buying something, it says why.',
  ],
  [
    'Recipes you would actually cook',
    'Honest times, realistic quantities, and no twelve-spice lists for a Tuesday.',
  ],
  [
    'Honest about food safety',
    'Temperatures and storage checks are spelled out in plain words, every time they matter.',
  ],
] as const;

export default function AboutPage() {
  return (
    <>
      <PageIntro
        eyebrow="About"
        title="We started with a full fridge and nothing to cook."
      />

      <Section>
        <div className="grid grid-auto-300 items-start gap-fluid-lg">
          {/* The prototype leaves a 4:5 photo slot here ("the team, or a real
              kitchen"). Until there is a real photo, the pantry stands in. */}
          <div
            aria-hidden
            className="grid aspect-[4/5] max-h-[560px] w-full grid-cols-3 content-center gap-sm rounded-lg bg-signature-cream p-[clamp(20px,4vw,40px)]"
          >
            {PANTRY_WALL.slice(0, 9).map(item => (
              <PantryArt
                key={item.art}
                art={item.art}
                size={72}
                className="h-auto w-full"
              />
            ))}
          </div>
          <div className="flex flex-col gap-5">
            <p className="m-0 text-[clamp(18px,2vw,22px)] leading-normal text-ink">
              Most kitchens are not empty. They are full of things that do not
              obviously go together — half a bag of spinach, a tin of chickpeas,
              the yoghurt from Sunday.
            </p>
            <p className="m-0 text-label-md leading-[1.65] text-body">
              Recipe apps start from what you could cook, then send you
              shopping. Petra starts from the other end: it knows exactly what
              is in your kitchen, and generates a recipe from it. Less waste
              follows on its own, because the food you already bought gets
              cooked.
            </p>
            <p className="m-0 text-label-md leading-[1.65] text-body">
              We measure ourselves by one question: did the recipe Petra wrote
              actually get cooked?
            </p>
          </div>
        </div>
      </Section>

      <Section>
        <ul className="m-0 grid list-none grid-auto-260 gap-[clamp(24px,3vw,40px)] border-t border-border p-0 pt-[clamp(28px,4vw,40px)]">
          {PRINCIPLES.map(([title, body]) => (
            <li key={title}>
              <h2 className="m-0 text-[21px] text-ink">{title}</h2>
              <p className="m-0 mt-2.5 text-body-lg leading-relaxed text-body">
                {body}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section>
        <div className="flex flex-wrap items-center justify-between gap-[clamp(24px,4vw,40px)] rounded-lg bg-signature-coral p-card-lg">
          <h2 className="m-0 max-w-[20ch] text-section text-white">
            Find out what your kitchen can make tonight.
          </h2>
          <Button asChild variant="secondary-on-dark" size="lg">
            <Link href="/auth/register">Get started free</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
