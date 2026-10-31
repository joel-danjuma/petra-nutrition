'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Loader2 } from 'lucide-react';
import { MEAL_TYPES, isPremiumRequired, useApi } from '@petra/shared';
import toast from 'react-hot-toast';

import { planSummary, WeekGrid } from '@/components/app/week';
import { EmptyState } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { useApiQuery } from '@/hooks/use-api-query';
import {
  dayOf,
  isoDay,
  mealName,
  type MealPlanWire,
  type MealWire,
} from '@/lib/wire';

const label = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

export default function MealPlanDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const api = useApi();
  const router = useRouter();
  const plan = useApiQuery(
    a => a.client.get<MealPlanWire>(`/meal-plans/${params.id}`),
    [params.id]
  );
  const [makingList, setMakingList] = useState(false);
  const today = isoDay(new Date());

  const makeList = async () => {
    setMakingList(true);
    try {
      const list = await api.client.post<{ id: string }>(
        '/shopping-lists/generate',
        {
          mealPlanId: params.id,
        }
      );
      router.push(`/dashboard/shopping-lists/${list.id}`);
    } catch (err) {
      toast.error(
        isPremiumRequired(err)
          ? 'Shopping lists are part of Premium.'
          : 'The list could not be written. Try again.'
      );
      setMakingList(false);
    }
  };

  if (plan.status === 'loading') {
    return (
      <div
        className="h-40 animate-pulse rounded-md bg-background"
        aria-label="Loading"
      />
    );
  }
  if (!plan.data) {
    return (
      <EmptyState
        icon={Calendar}
        title="That plan is not here"
        action={
          <Button asChild variant="secondary">
            <Link href="/dashboard/meal-plans">Back to the week</Link>
          </Button>
        }
      >
        It may have been deleted.
      </EmptyState>
    );
  }

  const p = plan.data;
  const byDay = p.meals.reduce<Record<string, MealWire[]>>((acc, m) => {
    (acc[dayOf(m.date)] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-md">
        <div className="flex min-w-0 items-start gap-xs">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="-ml-sm"
            aria-label="Back to the week"
          >
            <Link href="/dashboard/meal-plans">
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="m-0 truncate text-section text-ink">{p.name}</h1>
            <p className="m-0 mt-xs text-body-lg text-muted-foreground">
              {planSummary(p)}
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          className="min-h-12"
          disabled={makingList}
          onClick={makeList}
        >
          {makingList ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          Shopping list
        </Button>
      </header>

      <WeekGrid plan={p} today={today} />

      <section aria-labelledby="every-meal" className="mt-md">
        <h2
          id="every-meal"
          className="m-0 mb-sm text-lead font-medium text-ink"
        >
          Every meal
        </h2>
        <div className="grid grid-fill-280 gap-sm">
          {Object.entries(byDay)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([day, meals]) => (
              <section
                key={day}
                className="rounded-md border border-border bg-background p-md"
              >
                <h3 className="m-0 text-body-lg font-medium text-ink">
                  {new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </h3>
                <dl className="m-0 mt-xs">
                  {MEAL_TYPES.map(type => {
                    const meal = meals.find(m => m.mealType === type);
                    return (
                      <div
                        key={type}
                        className="flex gap-sm border-b border-border py-2 last:border-0"
                      >
                        <dt className="w-20 shrink-0 text-label-sm text-muted-foreground">
                          {label(type)}
                        </dt>
                        <dd className="m-0 min-w-0 text-body-md text-ink">
                          {meal ? (
                            meal.recipeId ? (
                              <Link
                                href={`/dashboard/recipes/${meal.recipeId}`}
                                className="underline-offset-2 active:underline"
                              >
                                {mealName(meal)}
                              </Link>
                            ) : (
                              mealName(meal)
                            )
                          ) : (
                            <span className="text-muted-foreground">
                              Not planned
                            </span>
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            ))}
        </div>
        {p.meals.length === 0 ? (
          <p className="m-0 text-body-md text-muted-foreground">
            No meals in this plan yet.
          </p>
        ) : null}
      </section>
    </div>
  );
}
