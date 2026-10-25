import type { ReactNode } from 'react';

import { MarketingFooter } from '@/components/marketing/footer';
import { MarketingHeader } from '@/components/marketing/header';
import { MarketingStickyCta } from '@/components/marketing/sticky-cta';

/** Header, footer and the narrow-screen sign-up bar, rendered once for every public page. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-md focus:top-md focus:z-50 focus:rounded-sm focus:bg-background focus:px-md focus:py-sm"
      >
        Skip to content
      </a>
      <MarketingHeader />
      <main id="main">{children}</main>
      <MarketingFooter />
      <MarketingStickyCta />
    </div>
  );
}
