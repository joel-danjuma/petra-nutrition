import type { Metadata } from 'next';
import { Check, Minus } from 'lucide-react';

import {
  FEATURE_MATRIX,
  PRICING_FAQ,
  type Inclusion,
} from '@/components/marketing/content';
import { Section } from '@/components/marketing/section';

import { PricingTiers } from './pricing-tiers';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Free for tonight. Premium for the week.',
};

export default function PricingPage() {
  return (
    <div className="font-pricing">
      <PricingTiers />

      <Section className="pt-[clamp(40px,6vw,64px)]" labelledBy="compare-title">
        <h2
          id="compare-title"
          className="m-0 mb-5 text-[clamp(22px,2.6vw,28px)] font-mid text-ink"
        >
          What is in each
        </h2>
        {/* A real table, laid out on the redesign's 1.8 / 0.6 / 0.6 grid. The
            minmax(64px, …) tier columns keep it three columns wide down to a
            320px phone, so it never needs a sideways scroll. */}
        <table className="w-full border-collapse border-t border-border">
          <colgroup>
            <col />
            <col className="w-[max(64px,18%)]" />
            <col className="w-[max(64px,18%)]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border text-label-sm font-mid-strong text-muted-foreground">
              <th scope="col" className="py-3.5 text-left font-mid-strong">
                Feature
              </th>
              <th scope="col" className="py-3.5 text-center font-mid-strong">
                Free
              </th>
              <th scope="col" className="py-3.5 text-center font-mid-strong">
                Premium
              </th>
            </tr>
          </thead>
          <tbody>
            {FEATURE_MATRIX.map(row => (
              <tr key={row.feature} className="border-b border-border">
                <th
                  scope="row"
                  className="py-md pr-sm text-left text-body-lg font-regular text-ink"
                >
                  {row.feature}
                </th>
                <td className="py-md text-center">
                  <Cell value={row.free} />
                </td>
                <td className="py-md text-center">
                  <Cell value={row.premium} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="m-0 mt-[clamp(40px,6vw,64px)] grid grid-auto-260 gap-fluid">
          {PRICING_FAQ.map(f => (
            <div key={f.q}>
              <dt className="text-lead font-mid-strong text-ink">{f.q}</dt>
              <dd className="m-0 mt-2.5 text-body-lg leading-relaxed text-muted-foreground">
                {f.a}
              </dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}

function Cell({ value }: { value: Inclusion }) {
  if (value === true) {
    return (
      <Check
        className="mx-auto h-[18px] w-[18px] text-success"
        aria-label="Included"
      />
    );
  }
  if (value === false) {
    return (
      <Minus
        className="mx-auto h-[18px] w-[18px] text-muted-foreground"
        aria-label="Not included"
      />
    );
  }
  return <span className="text-body-md text-ink">{value}</span>;
}
