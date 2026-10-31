import type { ReactNode } from 'react';
import Link from 'next/link';

import { Eyebrow, PantryArt } from '@/components/ds';
import { TESTIMONIALS } from '@/components/marketing/content';

const PANEL_ART = [
  'avocado',
  'eggs',
  'lemon',
  'bread-loaf',
  'honey-jar',
  'greens',
  'tomato',
  'olive-oil',
] as const;

/**
 * Sign in, sign up and password reset share one frame: the form in the left
 * column, and a cream panel of what Petra does on the right. The panel is
 * decoration, so below 900px it goes and the form has the screen.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const quote = TESTIMONIALS[0];

  return (
    <div className="grid min-h-screen grid-cols-1 bg-background nav:grid-cols-2">
      <div className="flex flex-col p-gutter">
        <Link
          href="/"
          className="self-start rounded-sm text-title-sm font-medium text-ink"
        >
          Petra
        </Link>
        <main className="flex flex-1 items-center justify-center py-[clamp(32px,6vw,64px)]">
          <div className="w-full max-w-[400px]">{children}</div>
        </main>
      </div>

      <aside
        aria-hidden
        className="hidden flex-col justify-end gap-lg bg-signature-cream p-[clamp(32px,5vw,64px)] nav:flex"
      >
        <div className="mb-auto grid max-w-[420px] grid-cols-4 gap-[clamp(8px,1.5vw,16px)]">
          {PANEL_ART.map(art => (
            <PantryArt
              key={art}
              art={art}
              size={72}
              className="h-auto w-full"
            />
          ))}
        </div>
        {/* An example of the dashboard's weekly summary, not live data. */}
        <div className="max-w-[420px] rounded-lg bg-background p-lg">
          <Eyebrow className="mb-sm">This week so far</Eyebrow>
          <p className="m-0 text-[44px] leading-none tracking-[-0.02em] text-ink">
            6 recipes
          </p>
          <p className="m-0 mt-2.5 text-body-lg text-body">
            generated from the pantry, with two things to buy.
          </p>
        </div>
        <blockquote className="m-0 max-w-[32ch] text-[22px] leading-[1.4] text-ink">
          {quote.quote}
        </blockquote>
        <p className="m-0 text-body-md text-muted-foreground">
          {quote.name} · {quote.detail}
        </p>
      </aside>
    </div>
  );
}
