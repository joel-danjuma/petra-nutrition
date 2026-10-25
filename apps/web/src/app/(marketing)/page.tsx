import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDown, Check, ScanLine } from 'lucide-react';

import { Eyebrow, PantryArt, PantryTile } from '@/components/ds';
import {
  HEADLINE_STATS,
  PANTRY_WALL,
  PRESS,
  TESTIMONIALS,
} from '@/components/marketing/content';
import { Section, SectionHead } from '@/components/marketing/section';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <>
      <Hero />
      <Press />
      <Stats />
      <PantryWall />
      <RecipeGeneration />
      <HowItWorks />
      <LessWaste />
      <Quotes />
      <ClosingCta />
    </>
  );
}

/* --------------------------------------------------------------------- hero */

function Hero() {
  return (
    <section className="mx-auto max-w-container px-gutter pb-[clamp(32px,5vw,56px)] pt-hero-top">
      <div className="grid grid-auto-320 items-center gap-fluid-lg">
        <div>
          <Eyebrow className="text-label-sm">Pantry to plate</Eyebrow>
          <h1 className="m-0 mt-[18px] max-w-[16ch] text-hero text-ink">
            Your pantry, turned into tonight&apos;s recipe.
          </h1>
          <p className="m-0 mt-lg max-w-[48ch] text-lede text-body">
            Petra keeps track of everything in your fridge, freezer and
            cupboard, then generates a recipe from it in seconds — sized for
            tonight, inside your diet, with nothing to buy.
          </p>
          <div className="mt-xl flex flex-wrap gap-sm">
            <Button asChild size="lg">
              <Link href="/auth/register">Get started free</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/platform">See how it works</Link>
            </Button>
          </div>
          <p className="m-0 mt-5 text-body-md text-muted-foreground">
            Free for one day at a time. No card, no trial clock.
          </p>
        </div>

        <TonightCard />
      </div>
    </section>
  );
}

/** A picture of the product, not a working control — so it is all static. */
function TonightCard() {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background p-[clamp(16px,2.5vw,24px)]">
      <div className="flex items-baseline justify-between gap-sm border-b border-border pb-md">
        <span className="text-label-md font-medium text-ink">Tonight</span>
        <span className="text-label-sm text-muted-foreground">
          Tuesday · cooking for 2
        </span>
      </div>
      <Eyebrow className="mb-2.5 mt-md">In your pantry</Eyebrow>
      <div className="grid grid-cols-2 gap-xs">
        <PantryTile variant="compact" name="Greens" days={2} />
        <PantryTile variant="compact" name="Eggs, 6" days={5} />
        <PantryTile variant="compact" name="Tinned tomatoes" days={null} />
        <PantryTile variant="compact" name="Garlic" days={null} />
      </div>
      <div className="mt-md rounded-lg bg-signature-dark p-5 text-white">
        <Eyebrow className="mb-1.5 text-on-dark-muted">
          Recipe generated
        </Eyebrow>
        <h2 className="m-0 text-title-md leading-snug text-white">
          Shakshuka with wilted greens and garlic toast
        </h2>
        <p className="m-0 mt-2.5 text-body-md text-on-dark-muted">
          20 minutes · every ingredient already in your pantry
        </p>
        <div className="mt-[18px] flex flex-wrap gap-2.5">
          <Button asChild variant="secondary-on-dark" className="text-body-lg">
            <Link href="/platform#cook">Start cook mode</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            className="text-body-lg text-white ring-1 ring-inset ring-on-dark-hairline active:bg-on-dark-surface"
          >
            <Link href="/platform#recipes">Read it first</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- press */

function Press() {
  return (
    <section
      aria-label="Press"
      className="mx-auto max-w-container px-gutter pb-[clamp(48px,7vw,88px)]"
    >
      <div className="flex flex-col items-center gap-5">
        <Eyebrow className="text-label-sm">Written about in</Eyebrow>
        <ul className="m-0 flex list-none flex-wrap justify-center gap-x-[clamp(20px,4vw,40px)] gap-y-sm p-0">
          {PRESS.map(name => (
            <li
              key={name}
              className="text-[clamp(15px,1.6vw,18px)] font-medium text-muted-foreground"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- stats */

function Stats() {
  return (
    <Section>
      <dl className="m-0 grid grid-cols-1 border-y border-border md:grid-cols-3">
        {HEADLINE_STATS.map((s, i) => (
          <div
            key={s.value}
            className={
              'py-[clamp(28px,4vw,40px)] md:px-[clamp(20px,3vw,32px)] md:first:pl-0 md:last:pr-0 ' +
              (i > 0 ? 'border-t border-border md:border-l md:border-t-0' : '')
            }
          >
            <dt className="text-[clamp(36px,5vw,52px)] leading-none tracking-[-0.02em] text-ink">
              {s.value}
            </dt>
            <dd className="m-0 mt-sm text-body-lg text-body">{s.body}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

/* ------------------------------------------------------------- pantry wall */

function PantryWall() {
  return (
    <Section labelledBy="pantry-title">
      <SectionHead
        id="pantry-title"
        eyebrow="Pantry management"
        title="Everything on the shelf, known to Petra."
        lede="Fridge, freezer, cupboard. Petra knows what you have, how much is left and when it turns, so every recipe it writes is one you can actually make."
      />
      <ul className="m-0 grid list-none grid-fill-92 gap-[clamp(4px,1.2vw,12px)] rounded-md bg-signature-cream p-[clamp(16px,3vw,32px)]">
        {PANTRY_WALL.map(item => (
          <li
            key={item.art}
            className="flex min-w-0 flex-col items-center gap-1.5 px-1 py-2"
          >
            <PantryArt
              art={item.art}
              size={72}
              className="h-auto w-full max-w-24"
            />
            <span className="text-center text-label-sm text-ink">
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* -------------------------------------------------------- recipe generation */

function RecipeGeneration() {
  return (
    <Section>
      <div className="rounded-lg bg-signature-coral p-card-lg text-white">
        <div className="grid grid-auto-280 items-center gap-[clamp(24px,4vw,40px)]">
          <div>
            <Eyebrow className="mb-3.5 text-label-sm text-on-dark-muted">
              Recipe generation
            </Eyebrow>
            <h2 className="m-0 text-section text-white">
              A recipe for what you have, not what the recipe wants.
            </h2>
            <p className="m-0 mt-[18px] max-w-[46ch] text-label-md leading-relaxed text-white">
              Most recipes assume a shop first. Petra starts from your pantry
              and writes the dish around it — scaling quantities, swapping what
              is missing, and staying inside your diet and the time you have.
            </p>
            <Button
              asChild
              variant="secondary-on-dark"
              size="lg"
              className="mt-7"
            >
              <Link href="/platform">See how it works</Link>
            </Button>
          </div>
          <div className="min-w-0 rounded-md bg-background p-[clamp(16px,2.5vw,24px)] text-ink">
            <Eyebrow className="mb-sm">You have</Eyebrow>
            <ul className="m-0 grid list-none grid-cols-2 gap-xs p-0 min-[420px]:grid-cols-4">
              {(
                [
                  ['bread-loaf', 'Bread'],
                  ['tomato', 'Tomato'],
                  ['garlic', 'Garlic'],
                  ['olive-oil', 'Olive oil'],
                ] as const
              ).map(([art, label]) => (
                <li
                  key={art}
                  className="flex min-w-0 flex-col items-center gap-1 rounded-sm bg-surface-soft px-1 py-2"
                >
                  <PantryArt
                    art={art}
                    size={72}
                    className="h-auto w-full max-w-[72px]"
                  />
                  <span className="text-eyebrow text-ink">{label}</span>
                </li>
              ))}
            </ul>
            <p className="m-0 my-3.5 flex items-center gap-xs text-label-sm text-muted-foreground">
              <ArrowDown className="h-4 w-4" aria-hidden />
              Petra writes
            </p>
            <div className="rounded-md bg-signature-dark p-md">
              <p className="m-0 text-lead leading-snug text-white">
                Pan con tomate, garlic-rubbed, finished with olive oil
              </p>
              <p className="m-0 mt-1.5 text-label-sm text-on-dark-muted">
                10 min · serves 2 · nothing to buy
              </p>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------- how it works */

function HowItWorks() {
  return (
    <Section labelledBy="how-title">
      <div className="mb-[clamp(28px,4vw,48px)] max-w-[24ch]">
        <Eyebrow className="text-label-sm">How it works</Eyebrow>
        <h2 id="how-title" className="m-0 mt-md text-section text-ink">
          Three steps from pantry to plate.
        </h2>
      </div>
      <ol className="m-0 grid list-none grid-auto-280 gap-fluid p-0">
        <Step
          n="01"
          title="Tell Petra what you have"
          body="Scan a barcode, photograph a shelf, or type it. Expiry dates come off the label, so your pantry stays accurate without you maintaining it."
        >
          <div className="flex min-h-[200px] flex-col justify-end gap-2.5 rounded-md bg-signature-mint p-5">
            <ScanRow art="tomato-tin" text="Scanned · Tinned tomatoes" />
            <ScanRow art="spice-jars" text="Photographed · 6 items read" />
            <div className="flex items-center gap-2.5 rounded-sm bg-signature-dark px-3.5 py-sm">
              <ScanLine className="h-4 w-4 text-white" aria-hidden />
              <span className="text-label-sm text-white">
                Point at the next label
              </span>
            </div>
          </div>
        </Step>
        <Step
          n="02"
          title="Generate a recipe"
          body="Ask for a cuisine, a time limit or just “dinner”. Petra writes the full recipe from your pantry — ingredients, quantities, method — inside your diet."
        >
          <div className="flex min-h-[200px] flex-col justify-end gap-2.5 rounded-md bg-signature-peach p-5">
            <p className="m-0 max-w-[84%] self-end rounded-md rounded-br-xs bg-signature-dark px-3.5 py-sm text-label-sm leading-[1.45] text-white">
              Something with the eggs, 20 minutes, no shopping
            </p>
            <p className="m-0 max-w-[88%] self-start rounded-md rounded-bl-xs bg-background px-3.5 py-sm text-label-sm leading-[1.45] text-ink">
              Shakshuka with the tinned tomatoes, greens and garlic. You have
              everything.
            </p>
          </div>
        </Step>
        <Step
          n="03"
          title="Cook it hands-free"
          body="One instruction at a time, timers where they belong. Your pantry updates itself as you go."
        >
          <div className="flex min-h-[200px] flex-col justify-between gap-md rounded-md bg-signature-dark p-5">
            <div className="flex items-center justify-between gap-sm">
              <Eyebrow className="text-on-dark-muted">Step 3 of 6</Eyebrow>
              <span className="text-label-sm text-on-dark-muted">
                12:00 left
              </span>
            </div>
            <p className="m-0 text-[19px] leading-[1.35] text-white">
              Crack the eggs into the sauce, cover, and give them six minutes.
            </p>
            <div>
              <Button
                asChild
                variant="secondary-on-dark"
                className="text-body-lg"
              >
                <Link href="/platform#cook">Open cook mode</Link>
              </Button>
            </div>
          </div>
        </Step>
      </ol>
    </Section>
  );
}

function Step({
  n,
  title,
  body,
  children,
}: {
  n: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <li>
      {children}
      <span
        aria-hidden
        className="mt-5 block text-title-md text-muted-foreground"
      >
        {n}
      </span>
      <h3 className="m-0 mt-xs text-[21px] text-ink">{title}</h3>
      <p className="m-0 mt-2.5 text-body-lg text-body">{body}</p>
    </li>
  );
}

function ScanRow({
  art,
  text,
}: {
  art: 'tomato-tin' | 'spice-jars';
  text: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2.5 rounded-sm bg-background px-3.5 py-sm">
      <span className="flex min-w-0 items-center gap-2.5 text-label-sm text-ink">
        <PantryArt art={art} size={32} className="h-7 w-7" />
        <span className="truncate">{text}</span>
      </span>
      <Check className="h-4 w-4 shrink-0 text-success" aria-label="Done" />
    </div>
  );
}

/* --------------------------------------------------------------- less waste */

function LessWaste() {
  return (
    <Section>
      <div className="rounded-md bg-signature-cream p-[clamp(24px,3.5vw,40px)]">
        <div className="grid grid-auto-280 items-center gap-[clamp(24px,4vw,40px)]">
          <div>
            <Eyebrow className="mb-2.5 text-label-sm">
              Less waste, as a side effect
            </Eyebrow>
            <h2 className="m-0 text-[clamp(22px,2.8vw,28px)] leading-[1.3] text-ink">
              Cooking from your pantry means less of it gets binned.
            </h2>
            <p className="m-0 mt-3.5 max-w-[46ch] text-body-lg text-body">
              Petra uses the ingredients closest to their date first. Once a
              month it shows what you cooked in time, what you lost, and what
              you keep over-buying.
            </p>
          </div>
          {/* An example of the monthly report, not anyone's real figures. */}
          <figure className="m-0 min-w-0 rounded-md bg-background p-5">
            <figcaption className="mb-md flex items-baseline justify-between gap-sm">
              <span className="text-body-lg font-medium text-ink">March</span>
              <span className="text-label-sm text-muted-foreground">
                92% of shopping eaten
              </span>
            </figcaption>
            <div className="flex flex-col gap-3.5">
              <Bar label="Cooked in time" value="11.4 kg" pct={92} tone="ink" />
              <Bar label="Lost" value="0.9 kg" pct={8} tone="coral" />
            </div>
            <p className="m-0 mt-md border-t border-border pt-md text-label-sm text-muted-foreground">
              You bought coriander three times. Two bunches went. Petra will ask
              before it goes on the list again.
            </p>
          </figure>
        </div>
      </div>
    </Section>
  );
}

function Bar({
  label,
  value,
  pct,
  tone,
}: {
  label: string;
  value: string;
  pct: number;
  tone: 'ink' | 'coral';
}) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-label-sm text-body">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-strong">
        <div
          className={
            tone === 'ink' ? 'h-full bg-primary' : 'h-full bg-app-danger'
          }
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- quotes */

function Quotes() {
  return (
    <Section>
      <div className="grid grid-auto-260 gap-fluid">
        {TESTIMONIALS.map(t => (
          <figure key={t.name} className="m-0">
            <blockquote className="m-0 text-[clamp(17px,1.8vw,19px)] leading-[1.45] text-ink">
              {t.quote}
            </blockquote>
            <figcaption className="mt-md text-body-md text-muted-foreground">
              {t.name} · {t.detail}
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ closing */

function ClosingCta() {
  return (
    <Section>
      <div className="flex flex-wrap items-center justify-between gap-[clamp(24px,4vw,40px)] rounded-lg bg-signature-forest p-card-lg">
        <div>
          <h2 className="m-0 max-w-[18ch] text-section text-white">
            Start with what is already in there.
          </h2>
          <p className="m-0 mt-3.5 max-w-[46ch] text-label-md leading-relaxed text-white">
            Tell Petra three things in your kitchen and it will write
            tonight&apos;s recipe before you finish typing the fourth.
          </p>
        </div>
        <Button asChild variant="secondary-on-dark" size="lg">
          <Link href="/auth/register">Get started free</Link>
        </Button>
      </div>
    </Section>
  );
}
