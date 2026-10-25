'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Eyebrow, Segmented } from '@/components/ds';
import { PRICING } from '@/components/marketing/content';
import { Button } from '@/components/ui/button';

type Billing = 'monthly' | 'annual';

const BILLING_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual · 2 months free' },
] as const;

/**
 * The headline, the billing switch and the two tier cards. Client-side only
 * for the switch; everything below it on the page is static.
 *
 * The pricing surface is the system's own sub-dialect: Inter at 475/575 and
 * pill-shaped buttons that appear nowhere else.
 */
export function PricingTiers() {
  const [billing, setBilling] = useState<Billing>('monthly');
  const premium = PRICING.premium[billing];

  return (
    <>
      <header className="mx-auto max-w-container px-gutter pb-[clamp(32px,5vw,48px)] pt-hero-top">
        <div className="flex flex-wrap items-end justify-between gap-lg">
          <div>
            <Eyebrow className="mb-[18px] text-label-sm">Pricing</Eyebrow>
            <h1 className="m-0 max-w-[18ch] font-pricing text-display font-mid tracking-[-0.02em] text-ink">
              Free for tonight. Premium for the week.
            </h1>
          </div>
          <Segmented
            variant="pill"
            label="Billing period"
            options={BILLING_OPTIONS}
            value={billing}
            onChange={setBilling}
            className="ring-1 ring-inset ring-border bg-background"
          />
        </div>
      </header>

      <div className="mx-auto max-w-container px-gutter">
        <div className="grid grid-auto-280 gap-[clamp(20px,3vw,24px)]">
          <Tier
            name="Free"
            price="£0"
            period="forever"
            note="Recipes from your kitchen, cook mode, and a plan for the day."
            cta={{ href: '/auth/register', label: 'Get started free' }}
          />
          <Tier
            dark
            name="Premium"
            badge="Most chosen"
            price={premium.price}
            period={premium.period}
            note={premium.note}
            cta={{
              href: '/auth/register?plan=premium',
              label: 'Choose Premium',
            }}
          />
        </div>
      </div>
    </>
  );
}

function Tier({
  name,
  badge,
  price,
  period,
  note,
  cta,
  dark = false,
}: {
  name: string;
  badge?: string;
  price: string;
  period: string;
  note: string;
  cta: { href: string; label: string };
  dark?: boolean;
}) {
  return (
    <section
      aria-label={`${name} plan`}
      className={
        'flex flex-col rounded-md p-[clamp(24px,3vw,32px)] font-pricing ' +
        (dark
          ? 'bg-signature-dark text-white'
          : 'border border-border bg-background text-ink')
      }
    >
      <div className="flex items-center justify-between gap-sm">
        <h2 className="m-0 text-title-md font-mid-strong">{name}</h2>
        {badge ? (
          <span className="text-eyebrow font-mid-strong uppercase tracking-[0.08em] text-on-dark-muted">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="m-0 mt-sm flex items-baseline gap-xs">
        <span
          className="text-[clamp(34px,4vw,45px)] font-mid tracking-[-0.02em] tabular-nums"
          aria-live="polite"
        >
          {price}
        </span>
        <span
          className={
            'text-body-md ' +
            (dark ? 'text-on-dark-muted' : 'text-muted-foreground')
          }
        >
          {period}
        </span>
      </p>
      <p
        className={
          'm-0 mt-sm flex-1 text-body-md leading-normal ' +
          (dark ? 'text-on-dark-muted' : 'text-muted-foreground')
        }
      >
        {note}
      </p>
      <Button
        asChild
        variant={dark ? 'secondary-on-dark' : 'pill'}
        size="lg"
        className="mt-lg rounded-pill text-label-md font-mid-strong"
      >
        <Link href={cta.href}>{cta.label}</Link>
      </Button>
    </section>
  );
}
