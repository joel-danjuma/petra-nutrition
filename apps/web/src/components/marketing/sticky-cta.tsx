'use client';

import Link from 'next/link';
import { useAuth } from '@petra/shared';

import { Button } from '@/components/ui/button';

/**
 * The narrow-screen sign-up bar, fixed to the bottom of every marketing page
 * below 900px. Hidden once signed in — there is nothing left to sign up for.
 * The spacer stops it covering the footer's last line.
 */
export function MarketingStickyCta() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return null;

  return (
    <>
      <div aria-hidden className="h-[84px] nav:hidden" />
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-sm border-t border-border bg-background px-md pt-sm pb-[calc(12px+env(safe-area-inset-bottom,0px))] nav:hidden">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-body-md font-medium text-ink">
            Free for one day at a time
          </p>
          <p className="m-0 mt-0.5 text-eyebrow text-muted-foreground">
            No card needed
          </p>
        </div>
        <Button asChild className="min-h-12 shrink-0">
          <Link href="/auth/register">Get started</Link>
        </Button>
      </div>
    </>
  );
}
