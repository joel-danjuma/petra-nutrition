'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Crown, Loader2 } from 'lucide-react';
import {
  ACTIVITY_LEVELS,
  HEALTH_GOALS,
  useApi,
  useAuth,
  type ActivityLevel,
  type HealthGoal,
} from '@petra/shared';
import toast from 'react-hot-toast';

import { controlClass, Field } from '@/components/app/sheet';
import { Chip, Segmented } from '@/components/ds';
import { Button } from '@/components/ui/button';

const DIETS = [
  'Vegetarian',
  'Vegan',
  'Pescatarian',
  'Gluten-free',
  'Dairy-free',
  'Halal',
  'Kosher',
];

/**
 * Allergies, stored under the agent's own allergen keys (`retrieval/terms.ts`
 * `ALLERGEN_TERMS`) so each one maps straight onto the terms it filters on —
 * a severe allergy blocks recipes outright rather than down-ranking them.
 */
const ALLERGIES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'peanut', label: 'Peanuts' },
  { value: 'nut', label: 'Tree nuts' },
  { value: 'dairy', label: 'Milk' },
  { value: 'egg', label: 'Eggs' },
  { value: 'gluten', label: 'Gluten' },
  { value: 'soy', label: 'Soy' },
  { value: 'sesame', label: 'Sesame' },
  { value: 'fish', label: 'Fish' },
  { value: 'shellfish', label: 'Shellfish' },
];

type Household = '1' | '2' | '3' | '4' | '5';
const HOUSEHOLD = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5+' },
] as const;

const words = (s: string) =>
  s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter(x => x !== v) : [...list, v];

interface Form {
  firstName: string;
  lastName: string;
  age: string;
  height: string;
  weight: string;
  activityLevel: ActivityLevel | '';
  householdSize: Household;
  dietaryRestrictions: string[];
  allergies: string[];
  healthGoals: HealthGoal[];
}

export default function ProfilePage() {
  const api = useApi();
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const premium = user?.subscriptionTier === 'PREMIUM';

  useEffect(() => {
    if (!user || form) return;
    const p = user.profile;
    setForm({
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      age: p?.age ? String(p.age) : '',
      height: p?.height ? String(p.height) : '',
      weight: p?.weight ? String(p.weight) : '',
      activityLevel: p?.activityLevel ?? '',
      householdSize: String(
        Math.min(5, Math.max(1, p?.householdSize ?? 2))
      ) as Household,
      dietaryRestrictions: p?.dietaryRestrictions ?? [],
      allergies: p?.allergies ?? [],
      healthGoals: p?.healthGoals ?? [],
    });
  }, [user, form]);

  if (!form)
    return (
      <div
        className="h-64 animate-pulse rounded-md bg-background"
        aria-label="Loading"
      />
    );

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm(f => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        profile: {
          age: form.age ? parseInt(form.age, 10) : undefined,
          height: form.height ? parseFloat(form.height) : undefined,
          weight: form.weight ? parseFloat(form.weight) : undefined,
          activityLevel: form.activityLevel || undefined,
          householdSize: Number(form.householdSize),
          dietaryRestrictions: form.dietaryRestrictions,
          allergies: form.allergies,
          healthGoals: form.healthGoals,
          cuisinePreferences: user?.profile?.cuisinePreferences ?? [],
        },
      });
      toast.success('Saved');
    } catch (err) {
      toast.error(
        (err as { message?: string })?.message ||
          'That could not be saved. Try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const upgrade = async () => {
    setUpgrading(true);
    try {
      await api.client.post('/subscription/upgrade');
      toast.success('You are on Premium.');
      window.location.reload();
    } catch {
      toast.error('The upgrade did not go through. Try again.');
      setUpgrading(false);
    }
  };

  return (
    <div className="flex max-w-[760px] flex-col gap-lg">
      <header>
        <h1 className="m-0 text-section text-ink">Profile</h1>
        <p className="m-0 mt-xs text-body-lg text-muted-foreground">
          {user?.email}
        </p>
      </header>

      <Group title="You">
        <div className="grid grid-cols-1 gap-sm min-[420px]:grid-cols-2">
          <Field label="First name" htmlFor="pf-first">
            <input
              id="pf-first"
              autoComplete="given-name"
              value={form.firstName}
              onChange={e => set('firstName', e.target.value)}
              className={controlClass}
            />
          </Field>
          <Field label="Last name" htmlFor="pf-last">
            <input
              id="pf-last"
              autoComplete="family-name"
              value={form.lastName}
              onChange={e => set('lastName', e.target.value)}
              className={controlClass}
            />
          </Field>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-body-md font-medium text-ink">Cooking for</span>
          <Segmented
            label="Cooking for"
            options={HOUSEHOLD}
            value={form.householdSize}
            onChange={v => set('householdSize', v)}
          />
          <p className="m-0 text-label-sm text-muted-foreground">
            Recipes are sized for this many unless you ask otherwise.
          </p>
        </div>
      </Group>

      <Group
        title="Allergies"
        description="Petra never suggests a recipe that contains these, and says so when it swaps something out."
      >
        <ChipSet>
          {ALLERGIES.map(a => (
            <Chip
              key={a.value}
              active={form.allergies.includes(a.value)}
              onClick={() => set('allergies', toggle(form.allergies, a.value))}
            >
              {a.label}
            </Chip>
          ))}
        </ChipSet>
      </Group>

      <Group title="Diet">
        <ChipSet>
          {DIETS.map(d => (
            <Chip
              key={d}
              active={form.dietaryRestrictions.includes(d)}
              onClick={() =>
                set('dietaryRestrictions', toggle(form.dietaryRestrictions, d))
              }
            >
              {d}
            </Chip>
          ))}
        </ChipSet>
      </Group>

      <Group
        title="Health"
        description="Optional. Used for portion sizes and the nutrition on recipes."
      >
        <div className="grid grid-cols-3 gap-sm">
          <Field label="Age" htmlFor="pf-age">
            <input
              id="pf-age"
              type="number"
              inputMode="numeric"
              min="0"
              value={form.age}
              onChange={e => set('age', e.target.value)}
              className={controlClass}
            />
          </Field>
          <Field label="Height (cm)" htmlFor="pf-height">
            <input
              id="pf-height"
              type="number"
              inputMode="decimal"
              min="0"
              value={form.height}
              onChange={e => set('height', e.target.value)}
              className={controlClass}
            />
          </Field>
          <Field label="Weight (kg)" htmlFor="pf-weight">
            <input
              id="pf-weight"
              type="number"
              inputMode="decimal"
              min="0"
              value={form.weight}
              onChange={e => set('weight', e.target.value)}
              className={controlClass}
            />
          </Field>
        </div>
        <Field label="Activity" htmlFor="pf-activity">
          <select
            id="pf-activity"
            value={form.activityLevel}
            onChange={e =>
              set('activityLevel', e.target.value as ActivityLevel | '')
            }
            className={controlClass}
          >
            <option value="">Not set</option>
            {ACTIVITY_LEVELS.map(l => (
              <option key={l} value={l}>
                {words(l)}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-body-md font-medium text-ink">Goals</span>
          <ChipSet>
            {HEALTH_GOALS.map(g => (
              <Chip
                key={g}
                active={form.healthGoals.includes(g)}
                onClick={() =>
                  set(
                    'healthGoals',
                    toggle(form.healthGoals, g) as HealthGoal[]
                  )
                }
              >
                {words(g)}
              </Chip>
            ))}
          </ChipSet>
        </div>
      </Group>

      <div className="sticky bottom-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom,0px))] z-10 -mx-1 flex justify-end bg-surface-soft px-1 py-xs nav:bottom-0">
        <Button size="lg" onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>

      <section
        id="subscription"
        aria-labelledby="plan-title"
        className={
          premium
            ? 'rounded-lg bg-signature-forest p-card text-white'
            : 'rounded-lg border border-border bg-background p-card'
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-md">
          <div className="flex items-start gap-sm">
            <Crown
              className={
                premium
                  ? 'mt-0.5 h-5 w-5 text-white'
                  : 'mt-0.5 h-5 w-5 text-muted-foreground'
              }
              aria-hidden
            />
            <div>
              <h2
                id="plan-title"
                className={
                  premium
                    ? 'm-0 text-title-md text-white'
                    : 'm-0 text-title-md text-ink'
                }
              >
                {premium ? 'Premium' : 'Free'}
              </h2>
              <p
                className={
                  premium
                    ? 'm-0 mt-1 text-body-md text-on-dark-muted'
                    : 'm-0 mt-1 text-body-md text-muted-foreground'
                }
              >
                {premium
                  ? 'The pantry, full-week plans and shopping lists are all on.'
                  : 'Premium adds the pantry, full-week plans and shopping lists that skip what you own.'}
              </p>
            </div>
          </div>
          {premium ? null : (
            <Button onClick={upgrade} disabled={upgrading}>
              {upgrading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Choose Premium
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

function Group({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-md rounded-lg border border-border bg-background p-card">
      <div>
        <h2 className="m-0 text-lead font-medium text-ink">{title}</h2>
        {description ? (
          <p className="m-0 mt-1 text-body-md text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ChipSet({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-xs">{children}</div>;
}
