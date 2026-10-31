import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Camera, Check, X } from 'lucide-react';

import { Eyebrow, PantryArt } from '@/components/ds';
import { PageIntro, Section } from '@/components/marketing/section';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Platform',
  description:
    'Pantry tracking, recipe generation, hands-free cook mode, and a week planned with a list of only the gaps.',
};

export default function PlatformPage() {
  return (
    <>
      <PageIntro
        eyebrow="Platform"
        title="Four things Petra does, so you do not have to think about them."
        lede="Each one feeds the next. Logging keeps the pantry accurate, the pantry drives every recipe, and recipes write the shopping list — with less going to waste along the way."
      />

      {/* The four numbers are a real sequence: each feature feeds the next. */}
      <Section className="flex flex-col gap-band">
        <Feature
          id="pantry"
          n="01 · Pantry"
          title="A pantry that stays true without upkeep."
          body="Scan a barcode, photograph a shelf or a receipt, or type it. Petra reads the expiry off the label and quietly takes things off when you cook them."
          demo={
            <Demo tone="bg-signature-mint" gap="gap-2.5">
              <div className="flex items-center gap-sm rounded-md bg-signature-dark p-md">
                <Camera className="h-5 w-5 shrink-0 text-white" aria-hidden />
                <span className="text-body-md text-white">
                  Receipt read · 14 items, 3 expiry dates
                </span>
              </div>
              {(
                [
                  ['eggs', 'Eggs, 6', 'Use by Tue'],
                  ['greens', 'Greens, 250 g', 'Use by Thu'],
                  ['milk-bottle', 'Milk, 1 L', 'Use by Fri'],
                ] as const
              ).map(([art, name, due]) => (
                <div
                  key={art}
                  className="flex items-center justify-between gap-sm rounded-sm bg-background px-3.5 py-sm"
                >
                  <span className="flex min-w-0 items-center gap-2.5 text-body-md text-ink">
                    <PantryArt art={art} size={32} />
                    <span className="truncate">{name}</span>
                  </span>
                  <span className="shrink-0 text-label-sm text-muted-foreground">
                    {due}
                  </span>
                </div>
              ))}
            </Demo>
          }
        />

        <Feature
          id="recipes"
          n="02 · Recipe generation"
          title="Recipes generated from your kitchen."
          body="Ask for a cuisine, a time limit, a craving, or just “dinner”. Petra writes a complete recipe from what you own — and adapts it when you ask for a swap, fewer carbs or a faster version."
          cta={{ href: '/dashboard/chat', label: 'Open the chat' }}
          demo={
            <Demo tone="bg-signature-peach" gap="gap-2.5">
              <p className="m-0 max-w-[84%] self-end rounded-md rounded-br-xs bg-signature-dark px-3.5 py-sm text-body-md leading-[1.45] text-white">
                Vegetarian tonight, and I have 20 minutes
              </p>
              <p className="m-0 max-w-[90%] self-start rounded-md rounded-bl-xs bg-background p-3.5 text-body-md leading-normal text-ink">
                Spinach and feta frittata. It clears the spinach before Thursday
                and the last of the feta. Nothing to buy.
              </p>
              <div className="flex flex-wrap gap-xs self-start">
                {['Show the method', 'Something warmer'].map(s => (
                  <span
                    key={s}
                    className="rounded-sm bg-background px-sm py-xs text-label-sm text-ink"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </Demo>
          }
        />

        <Feature
          id="cook"
          n="03 · Cook"
          title="Cook mode keeps your hands free."
          body="One instruction on screen, large enough to read from the hob. Timers where they belong, food-safety checks spelled out, and the next step a tap — or a wave — away."
          cta={{ href: '/dashboard/recipes', label: 'Try cook mode' }}
          demo={
            <div className="min-w-0 rounded-lg bg-signature-dark p-card text-white">
              <div className="flex justify-between gap-sm">
                <Eyebrow className="text-on-dark-muted">Step 4 of 6</Eyebrow>
                <span className="text-label-sm text-on-dark-muted tabular-nums">
                  04:00
                </span>
              </div>
              <div className="my-md h-1 overflow-hidden rounded-full bg-on-dark-hairline">
                <div className="h-full w-2/3 bg-white" />
              </div>
              <p className="m-0 text-[clamp(20px,2.4vw,26px)] leading-[1.3] text-white">
                Check the egg whites are fully set before the pan comes off.
              </p>
              <p className="m-0 mt-3.5 text-body-md text-on-dark-muted">
                Safety check · whites should be opaque, with no clear patches.
              </p>
            </div>
          }
        />

        <Feature
          id="plan"
          n="04 · Plan and shop"
          title="A week planned, and a list with only the gaps."
          body="Petra threads leftovers through the week and puts the batch cook where you have time. The list is cross-checked against the pantry before it is written."
          cta={{ href: '/dashboard/meal-plans', label: 'See a planned week' }}
          demo={
            <Demo tone="bg-signature-yellow" gap="gap-xs">
              <ListLine done label="Lemons ×2" />
              <ListLine done label="Flat-leaf parsley" />
              <ListLine label="Greek yoghurt — you have 300 g" />
              <ListLine label="Rice — 1.2 kg in the cupboard" />
            </Demo>
          }
        />
      </Section>

      <Section>
        <ul className="m-0 grid list-none grid-auto-240 gap-fluid rounded-md bg-signature-cream p-[clamp(24px,3.5vw,40px)]">
          {[
            [
              'Diets and allergies',
              'Set once. Every suggestion, plan and list respects them, and Petra says so when it swaps something out.',
            ],
            [
              'Household size',
              'Quantities scale to who is eating tonight, not who lives in the house.',
            ],
            [
              'Waste tracking',
              'A monthly view of what you cooked in time and what you lost, so the pattern is easy to fix.',
            ],
            [
              'Your data stays yours',
              'No selling, no ad targeting. Export or delete your pantry and history from settings.',
            ],
          ].map(([title, body]) => (
            <li key={title}>
              <h3 className="m-0 text-title-md text-ink">{title}</h3>
              <p className="m-0 mt-2.5 text-body-lg text-body">{body}</p>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

function Feature({
  id,
  n,
  title,
  body,
  cta,
  demo,
}: {
  id: string;
  n: string;
  title: string;
  body: string;
  cta?: { href: string; label: string };
  demo: ReactNode;
}) {
  return (
    <article
      id={id}
      className="grid scroll-mt-header grid-auto-300 items-center gap-fluid-lg"
    >
      <div>
        <span className="text-title-md text-muted-foreground">{n}</span>
        <h2 className="m-0 mt-sm text-section text-ink">{title}</h2>
        <p className="m-0 mt-md max-w-[46ch] text-label-md leading-relaxed text-body">
          {body}
        </p>
        {cta ? (
          <Button asChild variant="secondary" className="mt-lg min-h-12">
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        ) : null}
      </div>
      {demo}
    </article>
  );
}

function Demo({
  tone,
  gap,
  children,
}: {
  tone: string;
  gap: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col rounded-lg p-card', tone, gap)}>
      {children}
    </div>
  );
}

function ListLine({ label, done = false }: { label: string; done?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-sm rounded-sm px-3.5 py-sm',
        done ? 'bg-background' : 'bg-surface-soft'
      )}
    >
      {done ? (
        <Check
          className="h-4 w-4 shrink-0 text-success"
          aria-label="On the list"
        />
      ) : (
        <X
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-label="Skipped"
        />
      )}
      <span
        className={cn(
          'text-body-md',
          done ? 'text-ink' : 'text-muted-foreground line-through'
        )}
      >
        {label}
      </span>
    </div>
  );
}
