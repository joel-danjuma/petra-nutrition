'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { LogOut, User as UserIcon } from 'lucide-react';
import { useAuth, type User } from '@petra/shared';

import { cn } from '@/lib/utils';

import { APP_NAV, isNavActive } from './nav';

/**
 * The signed-in frame. One structural breakpoint (900px):
 *  - wide: a 240px sticky side rail with every destination and the user card;
 *  - narrow: a slim top bar and a fixed five-tab bar at the thumb.
 * The content column is the same in both; only the chrome moves.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen bg-surface-soft">
      <a
        href="#app-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-md focus:top-md focus:z-50 focus:rounded-sm focus:bg-background focus:px-md focus:py-sm"
      >
        Skip to content
      </a>

      {/* ---- side rail, ≥900px ---- */}
      <aside className="sticky top-0 hidden h-screen w-rail shrink-0 flex-col border-r border-border bg-background nav:flex">
        <div className="flex h-header items-center border-b border-border px-5">
          <Link
            href="/dashboard"
            className="rounded-sm text-lead font-medium text-ink"
          >
            Petra
          </Link>
        </div>
        <nav
          aria-label="App"
          className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-sm"
        >
          {APP_NAV.map(item => {
            const active = isNavActive(item, pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-target items-center gap-sm rounded-md px-sm text-body-md font-medium',
                  active
                    ? 'bg-surface-soft text-ink'
                    : 'text-muted-foreground active:bg-surface-soft'
                )}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <UserMenu user={user} placement="rail" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ---- top bar, <900px ---- */}
        <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b border-border bg-background px-md nav:hidden">
          <Link
            href="/dashboard"
            className="rounded-sm text-lead font-medium text-ink"
          >
            Petra
          </Link>
          <UserMenu user={user} placement="bar" />
        </header>

        <main
          id="app-main"
          className="flex-1 px-gutter-app py-[clamp(20px,3.5vw,40px)] pb-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom,0px)+24px)] nav:pb-[clamp(20px,3.5vw,40px)]"
        >
          <div className="mx-auto w-full max-w-app">{children}</div>
        </main>

        {/* ---- tab bar, <900px ---- */}
        <nav
          aria-label="App"
          className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background px-1 pt-1 pb-[calc(4px+env(safe-area-inset-bottom,0px))] nav:hidden"
        >
          {APP_NAV.filter(i => i.inTabBar).map(item => {
            const active = isNavActive(item, pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-md text-micro font-medium',
                  active
                    ? 'text-ink'
                    : 'text-muted-foreground active:bg-surface-soft'
                )}
              >
                <Icon
                  className="h-5 w-5"
                  strokeWidth={active ? 2.25 : 1.75}
                  aria-hidden
                />
                {item.short}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- user menu */

function Avatar({ user, size = 36 }: { user: User | null; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-primary text-body-md font-medium text-primary-foreground"
      style={{ width: size, height: size }}
    >
      {user?.firstName?.[0]?.toUpperCase() ?? '·'}
    </span>
  );
}

function planLine(user: User | null) {
  const tier = user?.subscriptionTier === 'PREMIUM' ? 'Premium' : 'Free';
  const n = user?.profile?.householdSize;
  return n ? `${tier} · cooking for ${n}` : tier;
}

/**
 * Profile and sign out. On the rail it is the whole user card; in the top bar
 * it is the avatar. Either way it opens the same menu.
 */
function UserMenu({
  user,
  placement,
}: {
  user: User | null;
  placement: 'rail' | 'bar';
}) {
  const { logout } = useAuth();
  const router = useRouter();
  const name = user ? `${user.firstName} ${user.lastName}`.trim() : '';

  const signOut = () => {
    logout();
    router.push('/');
  };

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        {placement === 'rail' ? (
          <button
            type="button"
            className="flex w-full items-center gap-sm border-t border-border p-md text-left active:bg-surface-soft"
          >
            <Avatar user={user} />
            <span className="min-w-0">
              <span className="block truncate text-body-md font-medium text-ink">
                {name}
              </span>
              <span className="mt-0.5 block truncate text-eyebrow text-muted-foreground">
                {planLine(user)}
              </span>
            </span>
          </button>
        ) : (
          <button
            type="button"
            aria-label="Account"
            className="rounded-full p-1 active:bg-surface-soft"
          >
            <Avatar user={user} />
          </button>
        )}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          side={placement === 'rail' ? 'top' : 'bottom'}
          align={placement === 'rail' ? 'start' : 'end'}
          sideOffset={8}
          className="z-50 min-w-[220px] rounded-md border border-border bg-background p-1.5"
        >
          {placement === 'bar' ? (
            <div className="border-b border-border px-sm pb-sm pt-1.5">
              <p className="m-0 truncate text-body-md font-medium text-ink">
                {name}
              </p>
              <p className="m-0 mt-0.5 text-eyebrow text-muted-foreground">
                {planLine(user)}
              </p>
            </div>
          ) : null}
          <Menu.Item asChild>
            <Link
              href="/dashboard/profile"
              className="flex min-h-target items-center gap-sm rounded-sm px-sm text-body-md text-ink outline-none data-[highlighted]:bg-surface-soft"
            >
              <UserIcon className="h-4 w-4" aria-hidden />
              Profile and settings
            </Link>
          </Menu.Item>
          <Menu.Item
            onSelect={signOut}
            className="flex min-h-target cursor-default items-center gap-sm rounded-sm px-sm text-body-md text-ink outline-none data-[highlighted]:bg-surface-soft"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
