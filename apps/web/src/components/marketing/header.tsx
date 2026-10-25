'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import { useAuth } from '@petra/shared';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const MARKETING_NAV = [
  { href: '/platform', label: 'Platform' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
] as const;

/**
 * The marketing header. One structural breakpoint (900px): inline links and
 * the CTA pair above it, a 44px menu button and a full-screen sheet below.
 */
export function MarketingHeader() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);

  // The sheet is hidden by CSS at 900px and up; close it too, so a window
  // widened with the menu open doesn't keep the page scroll-locked.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const onChange = () => mq.matches && setOpen(false);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const primary = isAuthenticated
    ? { href: '/dashboard', label: 'Open Petra' }
    : { href: '/auth/register', label: 'Get started free' };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex h-header max-w-container items-center justify-between gap-lg px-gutter">
        <Link
          href="/"
          className="rounded-sm text-title-sm font-medium tracking-[-0.01em] text-ink"
        >
          Petra
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-7 nav:flex">
          {MARKETING_NAV.map(item => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'py-1.5 text-body-lg',
                  active
                    ? 'text-ink shadow-[inset_0_-1px_0_var(--petra-ink)]'
                    : 'text-body active:text-ink'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-sm nav:flex">
          {isAuthenticated ? null : (
            <Link
              href="/auth/login"
              className="rounded-sm px-1 py-2.5 text-body-lg font-medium text-ink"
            >
              Sign in
            </Link>
          )}
          <Button asChild>
            <Link href={primary.href}>{primary.label}</Link>
          </Button>
        </div>

        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <Button
              variant="secondary"
              size="icon"
              className="nav:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Content
              className="fixed inset-0 z-50 flex flex-col bg-background pb-safe focus:outline-none nav:hidden"
              aria-describedby={undefined}
            >
              <div className="flex h-header items-center justify-between border-b border-border px-gutter">
                <Dialog.Title className="m-0 text-title-sm font-medium text-ink">
                  Petra
                </Dialog.Title>
                <Dialog.Close asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label="Close menu"
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </Button>
                </Dialog.Close>
              </div>
              <nav
                aria-label="Main"
                className="flex flex-1 flex-col overflow-y-auto px-gutter py-xs"
              >
                {[{ href: '/', label: 'Home' }, ...MARKETING_NAV].map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={pathname === item.href ? 'page' : undefined}
                    className="border-b border-border py-5 text-title-lg text-ink active:text-muted-foreground"
                  >
                    {item.label}
                  </Link>
                ))}
                {isAuthenticated ? null : (
                  <Link
                    href="/auth/login"
                    onClick={() => setOpen(false)}
                    className="border-b border-border py-5 text-title-lg text-ink active:text-muted-foreground"
                  >
                    Sign in
                  </Link>
                )}
              </nav>
              <div className="p-gutter">
                <Button asChild size="lg" fullWidth>
                  <Link href={primary.href} onClick={() => setOpen(false)}>
                    {primary.label}
                  </Link>
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </header>
  );
}
