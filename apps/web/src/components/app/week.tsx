import Link from 'next/link';

import { cn } from '@/lib/utils';
import { dayOf, mealName, type MealPlanWire, type MealWire } from '@/lib/wire';

const tagIs = (m: MealWire, word: string) =>
  (m.tag ?? '').toLowerCase().includes(word);

/** One meal per day for the week view: dinner where there is one. */
export function dinnersByDay(plan: MealPlanWire): MealWire[] {
  const byDay = new Map<string, MealWire>();
  for (const m of plan.meals) {
    const d = dayOf(m.date);
    const current = byDay.get(d);
    if (!current || (m.mealType === 'DINNER' && current.mealType !== 'DINNER'))
      byDay.set(d, m);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, m]) => m);
}

/** "7 dinners · 2 leftover nights · 1 batch cook" — the plan in one line. */
export function planSummary(plan: MealPlanWire): string {
  const days = dinnersByDay(plan);
  const leftovers = days.filter(m => tagIs(m, 'leftover')).length;
  const batch = days.filter(m => tagIs(m, 'batch')).length;
  const parts = [`${days.length} ${days.length === 1 ? 'dinner' : 'dinners'}`];
  if (leftovers)
    parts.push(`${leftovers} leftover ${leftovers === 1 ? 'night' : 'nights'}`);
  if (batch) parts.push(`${batch} batch ${batch === 1 ? 'cook' : 'cooks'}`);
  return parts.join(' · ');
}

const longDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' });

/**
 * The week as day cards. Today is the dark card; past days fade; a leftover
 * night sits on mint and a batch cook on peach — the demo-surface pastels,
 * used as whole card surfaces as the system allows.
 */
export function WeekGrid({
  plan,
  today,
}: {
  plan: MealPlanWire;
  today: string;
}) {
  const days = dinnersByDay(plan);
  return (
    <ol className="m-0 grid list-none grid-fill-220 gap-sm p-0">
      {days.map(m => {
        const d = dayOf(m.date);
        const isToday = d === today;
        const past = d < today;
        const leftover = tagIs(m, 'leftover');
        const batch = tagIs(m, 'batch');
        const label = [longDay(d), isToday ? 'tonight' : m.tag?.toLowerCase()]
          .filter(Boolean)
          .join(' · ');
        const detail = [
          m.recipe?.totalTime ? `${m.recipe.totalTime} min` : null,
          m.servings > 1 ? `serves ${m.servings}` : null,
          isToday ? m.tag : null,
        ]
          .filter(Boolean)
          .join(' · ');

        const body = (
          <>
            <p
              className={cn(
                'm-0 text-eyebrow font-medium uppercase tracking-[0.08em]',
                isToday
                  ? 'text-on-dark-muted'
                  : leftover || batch
                    ? 'text-ink'
                    : 'text-muted-foreground'
              )}
            >
              {label}
            </p>
            <p
              className={cn(
                'm-0 mt-2.5 text-lead leading-snug',
                isToday ? 'text-white' : 'text-ink'
              )}
            >
              {mealName(m)}
            </p>
            {detail ? (
              <p
                className={cn(
                  'm-0 mt-xs text-label-sm',
                  isToday
                    ? 'text-on-dark-muted'
                    : leftover || batch
                      ? 'text-body'
                      : 'text-muted-foreground'
                )}
              >
                {detail}
              </p>
            ) : null}
          </>
        );

        const surface = cn(
          'block h-full rounded-md p-md text-left',
          isToday
            ? 'bg-signature-dark'
            : leftover
              ? 'bg-signature-mint'
              : batch
                ? 'bg-signature-peach'
                : 'border border-border bg-background',
          past && 'opacity-70'
        );

        return (
          <li key={m.id} aria-current={isToday ? 'date' : undefined}>
            {m.recipeId ? (
              <Link
                href={`/dashboard/recipes/${m.recipeId}`}
                className={cn(surface, 'active:opacity-90')}
              >
                {body}
              </Link>
            ) : (
              <div className={surface}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
