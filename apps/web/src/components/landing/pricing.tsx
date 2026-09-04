'use client';

import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/**
 * The pricing band.
 *
 * Pricing is a deliberate sub-dialect in this system: Inter Display rather than
 * Space Grotesk, its own mid-weights, and pill-shaped buttons that appear
 * nowhere else in the product. The check glyph is Lucide `check`, never a
 * Unicode dingbat.
 */
const TIERS = [
  {
    name: 'Free',
    price: '£0',
    period: 'forever',
    description: 'One day at a time, with the pantry basics.',
    features: [
      'Ask Petra for tonight',
      'Pantry with expiry tracking',
      'One planned day at a time',
      'Barcode scanning',
    ],
    ctaLabel: 'Get started for free',
    featured: false,
  },
  {
    name: 'Premium',
    price: '£4.99',
    period: 'per month',
    description: 'The whole week, planned around your kitchen.',
    features: [
      'Everything in Free',
      'Full-week meal plans',
      'Shopping lists that skip what you own',
      'Camera logging and receipts',
      'Waste tracking and trends',
    ],
    ctaLabel: 'Choose Premium',
    featured: true,
  },
];

export function Pricing() {
  const router = useRouter();

  return (
    <section className="band mx-auto max-w-[1280px] px-lg">
      <div className="mb-xxl">
        <p className="font-pricing text-caption font-medium uppercase tracking-[0.16px] text-muted-foreground">
          Pricing
        </p>
        <h2 className="mt-md font-pricing text-display-md text-foreground">
          The plan that meets you where you are.
        </h2>
      </div>

      <div className="grid gap-lg md:grid-cols-2">
        {TIERS.map(tier => (
          <Card key={tier.name} surface={tier.featured ? 'soft' : 'content'}>
            <h3 className="font-pricing text-title-md text-foreground">{tier.name}</h3>
            <div className="mt-sm flex items-baseline gap-xs">
              <span className="font-pricing text-display-md text-foreground">{tier.price}</span>
              <span className="text-body-md text-muted-foreground">{tier.period}</span>
            </div>
            <p className="mt-sm font-pricing text-body-md text-muted-foreground">
              {tier.description}
            </p>

            <ul className="mt-lg flex list-none flex-col gap-sm p-0">
              {tier.features.map(feature => (
                <li key={feature} className="flex items-start gap-xs">
                  <Check className="mt-xxs h-4 w-4 shrink-0 text-success" strokeWidth={1.85} />
                  <span className="font-pricing text-body-md text-foreground">{feature}</span>
                </li>
              ))}
            </ul>

            {/* The pill button is the pricing sub-system's signal, and appears
                nowhere else in the product. */}
            <Button
              variant="pill"
              fullWidth
              className="mt-lg"
              onClick={() => router.push('/auth/register')}
            >
              {tier.ctaLabel}
            </Button>
          </Card>
        ))}
      </div>
    </section>
  );
}
