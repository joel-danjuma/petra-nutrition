'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { byDaysLeft, daysLeft, useAuth } from '@petra/shared';
import { Package } from 'lucide-react';

import { Eyebrow, PantryTile } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { useApiQuery } from '@/hooks/use-api-query';
import { cn } from '@/lib/utils';
import {
  dayOf,
  isoDay,
  mealName,
  type MealPlanListWire,
  type MealPlanWire,
  type MealWire,
  type PantryListWire,
} from '@/lib/wire';

const greeting = (h: number) =>
  h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';

/** The plan whose dates cover today, else the most recent one. */
const currentPlan = (plans: readonly MealPlanWire[], today: string) =>
  plans.find(p => dayOf(p.startDate) <= today && today <= dayOf(p.endDate)) ??
  null;

/** Tonight's meal: dinner if there is one, otherwise the day's last meal. */
const tonight = (plan: MealPlanWire | null, today: string): MealWire | null => {
  const meals = plan?.meals.filter(m => dayOf(m.date) === today) ?? [];
  return (
    meals.find(m => m.mealType === 'DINNER') ?? meals[meals.length - 1] ?? null
  );
};

export default function TodayPage() {
  const { user } = useAuth();
  const now = new Date();
  const today = isoDay(now);

  const plans = useApiQuery(api =>
    api.client.get<MealPlanListWire>('/meal-plans', {
      params: { limit: 6, sortBy: 'startDate', sortOrder: 'desc' },
    })
  );
  const pantry = useApiQuery(api =>
    api.client.get<PantryListWire>('/pantry', { params: { limit: 100 } })
  );
  const summary = useApiQuery(api => api.analytics.getWasteSummary());

  const plan = currentPlan(plans.data?.mealPlans ?? [], today);
  const meal = tonight(plan, today);
  const dueFirst = byDaysLeft(pantry.data?.items ?? [], now).slice(0, 3);

  return (
    <div className="flex flex-col gap-[clamp(20px,3vw,28px)]">
      <header>
        <Eyebrow className="text-label-sm">
          {now.toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </Eyebrow>
        <h1 className="m-0 mt-2.5 text-section text-ink">
          {greeting(now.getHours())}
          {user?.firstName ? `, ${user.firstName}` : ''}.{' '}
          {meal ? 'Dinner is sorted.' : 'What are we cooking?'}
        </h1>
      </header>

      <div className="grid grid-auto-300 items-start gap-[clamp(16px,2.5vw,24px)]">
        <TonightCard meal={meal} loading={plans.status === 'loading'} />

        <Panel
          title="Use these first"
          link={{ href: '/dashboard/pantry', label: 'Pantry' }}
        >
          {pantry.status === 'loading' ? (
            <Skeleton rows={3} />
          ) : pantry.needsPremium ? (
            <PremiumNote>Pantry tracking is part of Premium.</PremiumNote>
          ) : pantry.status === 'error' ? (
            <LoadFailed onRetry={pantry.reload} what="The pantry" />
          ) : dueFirst.length === 0 ? (
            <p className="m-0 text-body-md text-muted-foreground">
              Nothing logged yet.{' '}
              <Link
                href="/dashboard/pantry"
                className="text-ink underline underline-offset-2"
              >
                Add what is in the fridge
              </Link>{' '}
              and Petra will cook from it.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-xs p-0">
              {dueFirst.map(item => (
                <li key={item.id}>
                  <PantryTile
                    name={item.name}
                    category={item.category}
                    days={daysLeft(item.expirationDate, now)}
                    detail={`${item.quantity} ${item.unit}`}
                    className="min-h-0"
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="This week"
        link={{ href: '/dashboard/meal-plans', label: 'Full plan' }}
      >
        {plans.status === 'loading' ? (
          <Skeleton rows={1} />
        ) : plans.status === 'error' ? (
          <LoadFailed onRetry={plans.reload} what="This week" />
        ) : plan ? (
          <WeekStrip plan={plan} today={today} />
        ) : (
          <p className="m-0 text-body-md text-muted-foreground">
            No plan for this week.{' '}
            <Link
              href="/dashboard/meal-plans"
              className="text-ink underline underline-offset-2"
            >
              Plan the week
            </Link>{' '}
            and the shopping list writes itself.
          </p>
        )}
      </Panel>

      <dl className="m-0 grid grid-auto-160 gap-lg rounded-lg bg-signature-cream p-card">
        <Stat
          label={`Recipes cooked in ${summary.data?.month?.label ?? 'this month'}`}
          value={
            summary.data?.month ? String(summary.data.month.recipesCooked) : '—'
          }
        />
        <Stat
          label="In the pantry"
          value={
            pantry.data
              ? `${pantry.data.total ?? pantry.data.items.length} items`
              : '—'
          }
        />
        <Stat
          label="Kept out of the bin"
          value={
            summary.data?.month
              ? `${summary.data.month.cookedInTimeKg} kg`
              : '—'
          }
        />
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function TonightCard({
  meal,
  loading,
}: {
  meal: MealWire | null;
  loading: boolean;
}) {
  const recipe = meal?.recipe ?? null;
  return (
    <section
      aria-labelledby="tonight-title"
      className="rounded-lg bg-signature-dark p-card text-white"
    >
      <Eyebrow className="mb-xs text-on-dark-muted">Tonight</Eyebrow>
      {loading ? (
        <div
          className="h-16 animate-pulse rounded-sm bg-on-dark-surface"
          aria-label="Loading"
        />
      ) : meal ? (
        <>
          <h2 id="tonight-title" className="m-0 text-card-title text-white">
            {mealName(meal)}
          </h2>
          <p className="m-0 mt-sm text-body-lg text-on-dark-muted">
            {[
              recipe?.totalTime ? `${recipe.totalTime} minutes` : null,
              meal.servings ? `serves ${meal.servings}` : null,
              meal.tag,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <div className="mt-[22px] flex flex-wrap gap-2.5">
            {recipe ? (
              <>
                <Button
                  asChild
                  variant="secondary-on-dark"
                  className="min-h-12 text-body-lg"
                >
                  <Link href={`/dashboard/recipes/${recipe.id}/cook`}>
                    Start cook mode
                  </Link>
                </Button>
                <DarkGhost href={`/dashboard/recipes/${recipe.id}`}>
                  See recipe
                </DarkGhost>
              </>
            ) : null}
            <DarkGhost href="/dashboard/chat">Something else</DarkGhost>
          </div>
        </>
      ) : (
        <>
          <h2 id="tonight-title" className="m-0 text-card-title text-white">
            Nothing planned yet.
          </h2>
          <p className="m-0 mt-sm text-body-lg text-on-dark-muted">
            Tell Petra how long you have and it will write something from what
            is in the kitchen.
          </p>
          <div className="mt-[22px]">
            <Button
              asChild
              variant="secondary-on-dark"
              className="min-h-12 text-body-lg"
            >
              <Link href="/dashboard/chat">Ask Petra for tonight</Link>
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function DarkGhost({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button
      asChild
      variant="ghost"
      className="min-h-12 text-body-lg text-white ring-1 ring-inset ring-on-dark-hairline active:bg-on-dark-surface"
    >
      <Link href={href}>{children}</Link>
    </Button>
  );
}

function WeekStrip({ plan, today }: { plan: MealPlanWire; today: string }) {
  const dinners = plan.meals.filter(m => m.mealType === 'DINNER');
  const days = (dinners.length ? dinners : plan.meals).reduce<MealWire[]>(
    (acc, m) => {
      if (!acc.some(x => dayOf(x.date) === dayOf(m.date))) acc.push(m);
      return acc;
    },
    []
  );

  return (
    <ol className="scroll-row m-0 list-none gap-xs p-0 pb-1">
      {days.map(m => {
        const d = dayOf(m.date);
        const isToday = d === today;
        const past = d < today;
        const weekday = new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', {
          weekday: 'short',
        });
        return (
          <li
            key={m.id}
            aria-current={isToday ? 'date' : undefined}
            className={cn(
              'min-w-[128px] flex-[1_0_128px] rounded-sm p-sm',
              isToday
                ? 'bg-signature-dark'
                : past
                  ? 'bg-surface-soft'
                  : 'bg-background ring-1 ring-inset ring-border'
            )}
          >
            <p
              className={cn(
                'm-0 text-micro uppercase tracking-[0.08em]',
                isToday ? 'text-on-dark-muted' : 'text-muted-foreground'
              )}
            >
              {weekday}
              {isToday ? ' · tonight' : ''}
            </p>
            <p
              className={cn(
                'm-0 mt-1.5 text-body-md leading-snug',
                isToday
                  ? 'text-white'
                  : past
                    ? 'text-muted-foreground'
                    : 'text-ink'
              )}
            >
              {mealName(m)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function Panel({
  title,
  link,
  children,
}: {
  title: string;
  link: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-background p-5">
      <div className="mb-3.5 flex items-baseline justify-between gap-sm">
        <h2 className="m-0 text-lead font-medium text-ink">{title}</h2>
        <Link
          href={link.href}
          className="rounded-sm text-body-md text-muted-foreground active:text-ink"
        >
          {link.label}
        </Link>
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-eyebrow font-medium uppercase text-muted-foreground">
        {label}
      </dt>
      <dd className="m-0 mt-xs text-section tracking-[-0.02em] text-ink tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-xs" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-[52px] animate-pulse rounded-sm bg-surface-soft"
        />
      ))}
    </div>
  );
}

function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <p className="m-0 text-body-md text-muted-foreground">
      {what} did not load.{' '}
      <button
        type="button"
        onClick={onRetry}
        className="rounded-sm text-ink underline underline-offset-2"
      >
        Try again
      </button>
    </p>
  );
}

function PremiumNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-sm rounded-sm bg-surface-soft p-md">
      <p className="m-0 flex items-center gap-xs text-body-md text-ink">
        <Package className="h-4 w-4 text-muted-foreground" aria-hidden />
        {children}
      </p>
      <Link
        href="/dashboard/profile#subscription"
        className="text-body-md font-medium text-ink underline underline-offset-2"
      >
        See Premium
      </Link>
    </div>
  );
}
