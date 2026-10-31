'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Calendar, Copy, Loader2, Sparkles, Trash2 } from 'lucide-react';
import {
  GENERATION_TIMEOUT_MS,
  errorMessage,
  isPremiumRequired,
  useApi,
  useAuth,
} from '@petra/shared';
import toast from 'react-hot-toast';

import { controlClass, Field, Sheet } from '@/components/app/sheet';
import { planSummary, WeekGrid } from '@/components/app/week';
import { EmptyState, Segmented } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { useApiQuery } from '@/hooks/use-api-query';
import {
  dayOf,
  isoDay,
  type MealPlanListWire,
  type MealPlanWire,
} from '@/lib/wire';

const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${dayOf(iso)}T12:00:00`).toLocaleDateString('en-GB', opts);

export default function WeekPage() {
  const api = useApi();
  const router = useRouter();
  const plans = useApiQuery(a =>
    a.client.get<MealPlanListWire>('/meal-plans', {
      params: { limit: 20, sortBy: 'startDate', sortOrder: 'desc' },
    })
  );
  const [planning, setPlanning] = useState(false);
  const [makingList, setMakingList] = useState(false);

  const today = isoDay(new Date());
  const all = plans.data?.mealPlans ?? [];
  const current =
    all.find(p => dayOf(p.startDate) <= today && today <= dayOf(p.endDate)) ??
    all[0] ??
    null;
  const others = all.filter(p => p.id !== current?.id);

  const makeList = async (plan: MealPlanWire) => {
    setMakingList(true);
    try {
      const list = await api.client.post<{ id: string }>(
        '/shopping-lists/generate',
        {
          mealPlanId: plan.id,
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

  const removePlan = async (plan: MealPlanWire) => {
    if (!window.confirm(`Delete “${plan.name}”? This cannot be undone.`))
      return;
    plans.setData(d =>
      d ? { ...d, mealPlans: d.mealPlans.filter(p => p.id !== plan.id) } : d
    );
    try {
      await api.mealPlans.delete(plan.id);
      toast.success('Plan deleted');
    } catch {
      toast.error('The plan could not be deleted.');
      plans.reload();
    }
  };

  const duplicatePlan = async (plan: MealPlanWire) => {
    try {
      await api.mealPlans.duplicate(plan.id);
      toast.success('Plan copied');
      plans.reload();
    } catch {
      toast.error('The plan could not be copied.');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-md">
        <div className="min-w-0">
          <h1 className="m-0 text-section text-ink">
            {current
              ? `Week of ${fmtDay(current.startDate, { day: 'numeric', month: 'long' })}`
              : 'Week'}
          </h1>
          {current ? (
            <p className="m-0 mt-xs text-body-lg text-muted-foreground">
              {planSummary(current)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-xs">
          {current ? (
            <Button
              variant="secondary"
              className="min-h-12"
              disabled={makingList}
              onClick={() => makeList(current)}
            >
              {makingList ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Shopping list
            </Button>
          ) : null}
          <Button className="min-h-12" onClick={() => setPlanning(true)}>
            <Sparkles className="h-4 w-4" aria-hidden />
            {current ? 'Re-plan the week' : 'Plan the week'}
          </Button>
        </div>
      </header>

      {plans.status === 'loading' ? (
        <div className="grid grid-fill-220 gap-sm" aria-label="Loading">
          {Array.from({ length: 7 }, (_, i) => (
            <div
              key={i}
              className="h-[120px] animate-pulse rounded-md bg-background"
            />
          ))}
        </div>
      ) : plans.status === 'error' ? (
        <EmptyState
          icon={Calendar}
          title="The week did not load"
          action={
            <Button variant="secondary" onClick={plans.reload}>
              Try again
            </Button>
          }
        >
          {plans.error?.message}
        </EmptyState>
      ) : current ? (
        <WeekGrid plan={current} today={today} />
      ) : (
        <EmptyState
          icon={Calendar}
          title="No week planned yet"
          action={
            <Button onClick={() => setPlanning(true)}>
              <Sparkles className="h-4 w-4" aria-hidden />
              Plan the week
            </Button>
          }
        >
          Petra threads leftovers through the week and puts the batch cook where
          you have time.
        </EmptyState>
      )}

      {others.length ? (
        <section aria-labelledby="other-weeks" className="mt-lg">
          <h2
            id="other-weeks"
            className="m-0 mb-sm text-lead font-medium text-ink"
          >
            Other plans
          </h2>
          <ul className="m-0 list-none divide-y divide-border rounded-md border border-border bg-background p-0">
            {others.map(p => (
              <li key={p.id} className="flex items-center gap-sm px-md py-sm">
                <Link
                  href={`/dashboard/meal-plans/${p.id}`}
                  className="min-w-0 flex-1 rounded-sm py-1"
                >
                  <span className="block truncate text-body-lg text-ink">
                    {p.name}
                  </span>
                  <span className="block text-label-sm text-muted-foreground">
                    {fmtDay(p.startDate, { day: 'numeric', month: 'short' })} –{' '}
                    {fmtDay(p.endDate, { day: 'numeric', month: 'short' })} ·{' '}
                    {planSummary(p)}
                  </span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Copy ${p.name}`}
                  onClick={() => duplicatePlan(p)}
                >
                  <Copy className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${p.name}`}
                  onClick={() => removePlan(p)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <PlanSheet open={planning} onOpenChange={setPlanning} />
    </div>
  );
}

/**
 * Ask Petra for a plan. The API returns the plan as text rather than saving
 * it (MealPlanController.generateMealPlan), so this shows it to read — the
 * same behaviour as before the redesign, just legible.
 */
function PlanSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const api = useApi();
  const { user } = useAuth();
  const premium = user?.subscriptionTier === 'PREMIUM';
  const [days, setDays] = useState<'1' | '3' | '7'>(premium ? '7' : '1');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    try {
      const plan = await api.client.post<{
        content: string;
        structuredData?: unknown;
      }>(
        '/meal-plans/generate',
        {
          days: Number(days),
          preferences: notes.trim() ? { notes: notes.trim() } : undefined,
        },
        { timeoutMs: GENERATION_TIMEOUT_MS }
      );
      setResult(
        plan.content || JSON.stringify(plan.structuredData, null, 2)
      );
    } catch (err) {
      toast.error(
        errorMessage(err, 'The plan could not be written. Try again.')
      );
    } finally {
      setBusy(false);
    }
  };

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) setResult(null);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={close}
      title={result ? 'Your plan' : 'Plan the week'}
      description={
        result
          ? undefined
          : 'Petra plans around what is in the pantry and your diet.'
      }
      footer={
        result ? (
          <>
            <Button variant="secondary" onClick={() => setResult(null)}>
              Try again
            </Button>
            <Button onClick={() => close(false)}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button onClick={generate} disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden />
              )}
              {busy ? 'Planning…' : 'Plan it'}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="whitespace-pre-wrap rounded-sm bg-surface-soft p-md text-body-md leading-relaxed text-ink">
          {result}
        </div>
      ) : (
        <div className="flex flex-col gap-md">
          <div className="flex flex-col gap-1.5">
            <span className="text-body-md font-medium text-ink">
              How many days
            </span>
            <Segmented
              label="How many days"
              value={days}
              onChange={v => setDays(v)}
              options={[
                { value: '1', label: '1 day' },
                { value: '3', label: '3 days' },
                { value: '7', label: 'Week' },
              ]}
            />
            {!premium ? (
              <p className="m-0 text-label-sm text-muted-foreground">
                Free plans one day at a time. Longer plans are part of Premium.
              </p>
            ) : null}
          </div>
          <Field label="Anything to know? (optional)" htmlFor="plan-notes">
            <textarea
              id="plan-notes"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Vegetarian on weekdays, a batch cook on Sunday"
              className={`${controlClass} py-sm`}
            />
          </Field>
        </div>
      )}
    </Sheet>
  );
}
