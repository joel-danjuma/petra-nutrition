'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  BookOpen,
  ChefHat,
  Heart,
  ShieldCheck,
  Sprout,
  Star,
} from 'lucide-react';
import { useApi } from '@petra/shared';
import toast from 'react-hot-toast';

import { EmptyState, Eyebrow, PantryArt } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { useApiQuery } from '@/hooks/use-api-query';
import { cn } from '@/lib/utils';
import { amountOf, type RecipeWire } from '@/lib/wire';

type Status = NonNullable<RecipeWire['pantryMatch']>['ingredients'][number];

const statusText = (s: Status | undefined) => {
  if (!s) return null;
  if (s.status === 'missing') return 'Buy';
  if (s.status === 'use-soon') {
    if (s.daysLeft === null || s.daysLeft > 0)
      return s.daysLeft === 1 ? 'Use in 1 day' : `Use in ${s.daysLeft} days`;
    return s.daysLeft === 0 ? 'Use today' : 'Past its date';
  }
  return 'Have';
};

export default function RecipePage({ params }: { params: { id: string } }) {
  const api = useApi();
  const recipe = useApiQuery(
    a => a.client.get<RecipeWire>(`/recipes/${params.id}`),
    [params.id]
  );

  if (recipe.status === 'loading') {
    return (
      <div
        className="h-72 animate-pulse rounded-lg bg-background"
        aria-label="Loading"
      />
    );
  }
  const r = recipe.data;
  if (!r) {
    return (
      <EmptyState
        icon={BookOpen}
        title="That recipe is not here"
        action={
          <Button asChild variant="secondary">
            <Link href="/dashboard/recipes">All recipes</Link>
          </Button>
        }
      >
        It may have been removed.
      </EmptyState>
    );
  }

  const match = r.pantryMatch;
  const byIngredient = new Map(
    match?.ingredients.map(i => [i.ingredientId, i]) ?? []
  );
  const steps = [...r.instructions].sort((a, b) => a.step - b.step);
  const ingredients = [...r.ingredients].sort((a, b) => a.order - b.order);

  const facts = [
    { label: 'Time', value: r.totalTime ? `${r.totalTime} min` : '—' },
    ...(match
      ? [
          {
            label: 'To buy',
            value: match.toBuy === 0 ? 'Nothing' : `${match.toBuy}`,
          },
          {
            label: 'Clears',
            value: match.clears === 1 ? '1 item' : `${match.clears} items`,
          },
        ]
      : []),
    ...(r.nutrition
      ? [
          {
            label: 'Per serving',
            value: `${Math.round(r.nutrition.calories)} kcal`,
          },
        ]
      : []),
  ];

  const toggleFavourite = async () => {
    const was = !!r.isFavorited;
    recipe.setData(d => (d ? { ...d, isFavorited: !was } : d));
    try {
      if (was) await api.recipes.unfavorite(r.id);
      else await api.recipes.favorite(r.id);
    } catch {
      recipe.setData(d => (d ? { ...d, isFavorited: was } : d));
      toast.error('That could not be saved. Try again.');
    }
  };

  const rate = async (n: number) => {
    const was = r.userRating ?? null;
    recipe.setData(d => (d ? { ...d, userRating: n } : d));
    try {
      await api.recipes.rate(r.id, n);
    } catch {
      recipe.setData(d => (d ? { ...d, userRating: was } : d));
      toast.error('The rating could not be saved.');
    }
  };

  return (
    <article className="flex flex-col gap-[clamp(20px,3vw,32px)]">
      <div>
        <Button
          asChild
          variant="ghost"
          className="-ml-sm text-muted-foreground"
        >
          <Link href="/dashboard/recipes">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Recipes
          </Link>
        </Button>
      </div>

      <div className="grid grid-auto-300 items-center gap-[clamp(20px,3vw,32px)]">
        <div className="min-w-0">
          <Eyebrow className="text-label-sm">
            {[r.cuisine, r.servings ? `serves ${r.servings}` : null]
              .filter(Boolean)
              .join(' · ') || 'Recipe'}
          </Eyebrow>
          <h1 className="m-0 mt-2.5 text-[clamp(28px,3.8vw,40px)] leading-[1.12] text-ink">
            {r.title}
          </h1>
          {r.description ? (
            <p className="m-0 mt-sm max-w-[54ch] text-body-lg text-body">
              {r.description}
            </p>
          ) : null}
          <dl className="m-0 mt-[18px] flex flex-wrap gap-[clamp(16px,3vw,28px)]">
            {facts.map(f => (
              <div key={f.label}>
                <dt className="text-eyebrow text-muted-foreground">
                  {f.label}
                </dt>
                <dd className="m-0 mt-1 text-lead text-ink tabular-nums">
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-lg flex flex-wrap gap-xs">
            <Button asChild size="lg">
              <Link href={`/dashboard/recipes/${r.id}/cook`}>
                <ChefHat className="h-[18px] w-[18px]" aria-hidden />
                Start cook mode
              </Link>
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={toggleFavourite}
              aria-pressed={!!r.isFavorited}
            >
              <Heart
                className={cn(
                  'h-[18px] w-[18px]',
                  r.isFavorited && 'fill-current'
                )}
                aria-hidden
              />
              {r.isFavorited ? 'Saved' : 'Save'}
            </Button>
          </div>
        </div>

        <div className="relative aspect-[4/3] w-full max-w-full overflow-hidden rounded-lg bg-signature-cream">
          {r.imageUrl ? (
            <Image
              src={r.imageUrl}
              alt=""
              fill
              sizes="(min-width: 900px) 520px, 100vw"
              className="object-cover"
            />
          ) : (
            // No photo: the dish's first few ingredients stand in.
            <div
              aria-hidden
              className="grid h-full grid-cols-3 content-center gap-sm p-[clamp(20px,4vw,40px)]"
            >
              {ingredients.slice(0, 6).map(i => (
                <PantryArt
                  key={i.id}
                  name={i.name}
                  size={72}
                  className="h-auto w-full"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-auto-280 items-start gap-[clamp(20px,3vw,32px)]">
        <section
          aria-labelledby="ingredients"
          className="rounded-lg border border-border bg-background p-5"
        >
          <h2
            id="ingredients"
            className="m-0 mb-3.5 text-title-sm font-medium text-ink"
          >
            Ingredients
          </h2>
          <ul className="m-0 list-none p-0">
            {ingredients.map(i => {
              const s = byIngredient.get(i.id);
              const text = statusText(s);
              return (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-sm border-b border-border py-xs last:border-0"
                >
                  <span className="flex min-w-0 items-center gap-sm text-body-lg text-ink">
                    <PantryArt name={i.name} size={40} />
                    <span className="min-w-0">
                      {i.name}
                      {i.amount ? `, ${amountOf(i)}` : ''}
                      {i.notes ? (
                        <span className="block text-label-sm text-muted-foreground">
                          {i.notes}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  {text ? (
                    <span
                      className={cn(
                        'shrink-0 text-label-sm',
                        s?.status === 'use-soon'
                          ? 'text-app-danger'
                          : s?.status === 'missing'
                            ? 'font-medium text-ink'
                            : 'text-muted-foreground'
                      )}
                    >
                      {text}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="method">
          <h2
            id="method"
            className="m-0 mb-3.5 text-title-sm font-medium text-ink"
          >
            Method
          </h2>
          <ol className="m-0 flex list-none flex-col gap-md p-0">
            {steps.map(s => (
              <li key={s.id} className="flex gap-3.5">
                <span
                  aria-hidden
                  className="w-7 shrink-0 text-body-lg text-muted-foreground tabular-nums"
                >
                  {String(s.step).padStart(2, '0')}
                </span>
                <span className="text-body-lg leading-[1.55] text-ink">
                  {s.instruction}
                  {s.duration ? (
                    <span className="mt-1 block text-label-sm text-muted-foreground">
                      {s.duration} min
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-lg flex flex-wrap items-center gap-sm">
            <span
              id="rate-label"
              className="text-body-md text-muted-foreground"
            >
              How was it?
            </span>
            <div
              role="radiogroup"
              aria-labelledby="rate-label"
              className="flex"
            >
              {[1, 2, 3, 4, 5].map(n => {
                const on = (r.userRating ?? 0) >= n;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={r.userRating === n}
                    aria-label={`${n} out of 5`}
                    onClick={() => rate(n)}
                    className="flex h-11 w-11 items-center justify-center rounded-sm text-ink active:bg-secondary"
                  >
                    <Star
                      className={cn(
                        'h-5 w-5',
                        on ? 'fill-current' : 'text-muted-foreground'
                      )}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {r.safetyNote || r.zeroWasteNote ? (
            <div className="mt-lg flex flex-col gap-sm">
              {r.safetyNote ? (
                <Note icon={ShieldCheck} title="Cook it safe">
                  {r.safetyNote}
                </Note>
              ) : null}
              {r.zeroWasteNote ? (
                <Note icon={Sprout} title="Nothing gets binned">
                  {r.zeroWasteNote}
                </Note>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </article>
  );
}

function Note({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof ShieldCheck;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-md bg-signature-cream p-md">
      <p className="m-0 flex items-center gap-xs text-body-md font-medium text-ink">
        <Icon className="h-4 w-4" aria-hidden />
        {title}
      </p>
      <p className="m-0 mt-1.5 text-body-md leading-relaxed text-body">
        {children}
      </p>
    </div>
  );
}
