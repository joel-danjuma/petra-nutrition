'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChefHat, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { GeneratedRecipe } from '@petra/shared';

import { Eyebrow, PantryArt } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { useApiQuery } from '@/hooks/use-api-query';
import type { RecipeWire } from '@/lib/wire';

/**
 * The end of every recipe turn in chat: a card you can cook from.
 *
 * Drawn as cook mode's own front door — the dark surface, the dish, the first
 * step, and "Start cook mode" as the one emphasised action — so a recipe
 * request never ends on prose alone. Two sources feed it: a recipe from the
 * library (`recipeId`), and a dish the assistant composed (`generatedRecipe`),
 * which has to be saved before cook mode can open it.
 */
function CookCardFrame({
  eyebrow,
  title,
  meta,
  firstStep,
  stepCount,
  ingredients,
  actions,
  footer,
}: {
  eyebrow: string;
  title: string;
  meta: string;
  firstStep?: string;
  stepCount: number;
  ingredients: string[];
  actions: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section
      aria-label={`${title}, ready to cook`}
      className="overflow-hidden rounded-lg bg-signature-dark text-white"
    >
      <div className="p-card">
        <Eyebrow className="text-on-dark-muted">{eyebrow}</Eyebrow>
        <h2 className="m-0 mt-xs text-card-title text-white">{title}</h2>
        {meta ? (
          <p className="m-0 mt-xs text-body-md text-on-dark-muted">{meta}</p>
        ) : null}

        {ingredients.length ? (
          <ul
            aria-label="Ingredients"
            className="m-0 mt-md flex list-none flex-wrap gap-xs p-0"
          >
            {ingredients.slice(0, 6).map(name => (
              <li
                key={name}
                className="flex items-center gap-1.5 rounded-sm bg-on-dark-surface py-1 pl-1 pr-sm text-label-sm text-white"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-background">
                  <PantryArt name={name} size={32} className="h-6 w-6" />
                </span>
                {name}
              </li>
            ))}
            {ingredients.length > 6 ? (
              <li className="self-center px-xs text-label-sm text-on-dark-muted">
                +{ingredients.length - 6} more
              </li>
            ) : null}
          </ul>
        ) : null}

        {firstStep ? (
          <div className="mt-md border-t border-on-dark-hairline pt-md">
            <p className="m-0 text-eyebrow font-medium uppercase text-on-dark-muted">
              Step 1 of {stepCount}
            </p>
            <p className="m-0 mt-1.5 line-clamp-3 text-label-md leading-snug text-white">
              {firstStep}
            </p>
          </div>
        ) : null}

        <div className="mt-lg flex flex-wrap gap-xs">{actions}</div>
      </div>
      {footer}
    </section>
  );
}

const DarkGhost = ({ children }: { children: ReactNode }) => (
  <Button
    asChild
    variant="ghost"
    className="text-white ring-1 ring-inset ring-on-dark-hairline active:bg-on-dark-surface"
  >
    {children}
  </Button>
);

/* ------------------------------------------------------------- library dish */

export function LibraryCookCard({ recipeId }: { recipeId: string }) {
  const recipe = useApiQuery(
    a => a.client.get<RecipeWire>(`/recipes/${recipeId}`),
    [recipeId]
  );

  if (recipe.status === 'loading') {
    return (
      <div
        className="h-48 animate-pulse rounded-lg bg-signature-dark"
        aria-label="Loading the recipe"
      />
    );
  }

  const r = recipe.data;
  if (!r) {
    // The recipe vanished (deleted since the reply was written); the prose
    // still stands, and a dead card would only be noise.
    return null;
  }

  const steps = [...r.instructions].sort((a, b) => a.step - b.step);
  const ingredients = [...r.ingredients]
    .sort((a, b) => a.order - b.order)
    .map(i => i.name);
  const toBuy = r.pantryMatch?.toBuy;

  return (
    <CookCardFrame
      eyebrow="Ready to cook"
      title={r.title}
      meta={[
        r.totalTime ? `${r.totalTime} min` : null,
        r.servings ? `serves ${r.servings}` : null,
        toBuy === undefined
          ? null
          : toBuy === 0
            ? 'nothing to buy'
            : `${toBuy} to buy`,
      ]
        .filter(Boolean)
        .join(' · ')}
      firstStep={steps[0]?.instruction}
      stepCount={steps.length}
      ingredients={ingredients}
      actions={
        <>
          {steps.length ? (
            <Button asChild variant="secondary-on-dark">
              <Link href={`/dashboard/recipes/${r.id}/cook`}>
                <ChefHat className="h-4 w-4" aria-hidden />
                Start cook mode
              </Link>
            </Button>
          ) : null}
          <DarkGhost>
            <Link href={`/dashboard/recipes/${r.id}`}>See recipe</Link>
          </DarkGhost>
        </>
      }
    />
  );
}

/* ------------------------------------------------------------ composed dish */

/** The contract's own type: the card renders exactly what the reply carried. */
export function ComposedCookCard({
  recipe,
  calories,
  estimated,
  savedId,
  onSave,
}: {
  recipe: GeneratedRecipe;
  calories?: number;
  estimated?: boolean;
  /** Set once saved, so the card opens the saved copy instead of saving again. */
  savedId?: string;
  /** Saves the dish and resolves to its new id, or null if it failed. */
  onSave: () => Promise<string | null>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | 'cook' | 'save'>(null);

  const steps = [...recipe.instructions].sort((a, b) => a.step - b.step);
  const minutes = recipe.prepTime + recipe.cookTime;

  // Cook mode reads a saved recipe, so a composed one is kept first. That is
  // also what the user would want: a dish worth cooking is worth finding again.
  const startCooking = async () => {
    setBusy('cook');
    const id = savedId ?? (await onSave());
    if (id) {
      router.push(`/dashboard/recipes/${id}/cook`);
    } else {
      toast.error(
        'The recipe could not be saved, so cook mode cannot open it yet.'
      );
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    await onSave();
    setBusy(null);
  };

  return (
    <CookCardFrame
      eyebrow="Written for you · ready to cook"
      title={recipe.title}
      meta={[
        minutes ? `${minutes} min` : null,
        `serves ${recipe.servings}`,
        recipe.difficulty.toLowerCase(),
        calories
          ? `${Math.round(calories)} kcal${estimated ? ' (estimated)' : ''}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      firstStep={steps[0]?.instruction}
      stepCount={steps.length}
      ingredients={recipe.ingredients.filter(i => !i.staple).map(i => i.name)}
      actions={
        <>
          <Button
            variant="secondary-on-dark"
            onClick={startCooking}
            disabled={busy !== null}
          >
            {busy === 'cook' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ChefHat className="h-4 w-4" aria-hidden />
            )}
            Start cook mode
          </Button>
          {savedId ? (
            <DarkGhost>
              <Link href={`/dashboard/recipes/${savedId}`}>
                <Check className="h-4 w-4" aria-hidden />
                Saved · see recipe
              </Link>
            </DarkGhost>
          ) : (
            <Button
              variant="ghost"
              onClick={save}
              disabled={busy !== null}
              className="text-white ring-1 ring-inset ring-on-dark-hairline active:bg-on-dark-surface"
            >
              {busy === 'save' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Save for later
            </Button>
          )}
        </>
      }
      footer={
        // Until it is saved there is no recipe page, so the whole method is
        // one tap away here rather than nowhere.
        <details className="group border-t border-on-dark-hairline">
          <summary className="flex min-h-target cursor-pointer list-none items-center px-card text-body-md text-on-dark-muted active:bg-on-dark-surface">
            <span className="group-open:hidden">Read the whole method</span>
            <span className="hidden group-open:inline">Hide the method</span>
          </summary>
          <div className="flex flex-col gap-sm px-card pb-card">
            <p className="m-0 text-body-md text-white">
              {recipe.ingredients
                .map(i =>
                  `${i.amount} ${i.unit} ${i.name}`.replace(/\s+/g, ' ').trim()
                )
                .join(', ')}
            </p>
            <ol className="m-0 flex list-none flex-col gap-xs p-0">
              {steps.map(s => (
                <li
                  key={s.step}
                  className="flex gap-sm text-body-md text-white"
                >
                  <span className="w-5 shrink-0 text-on-dark-muted tabular-nums">
                    {s.step}
                  </span>
                  <span>
                    {s.instruction}
                    {s.tip ? (
                      <span className="mt-0.5 block text-label-sm text-on-dark-muted">
                        {s.tip}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </details>
      }
    />
  );
}
