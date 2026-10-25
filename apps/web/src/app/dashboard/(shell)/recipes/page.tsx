'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BookOpen, Heart, MessageSquare, Search } from 'lucide-react';
import { useApi } from '@petra/shared';
import toast from 'react-hot-toast';

import { controlClass } from '@/components/app/sheet';
import { Chip, ChipRow, EmptyState, PantryArt } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { useApiQuery } from '@/hooks/use-api-query';
import { cn } from '@/lib/utils';
import type { RecipeSummaryWire } from '@/lib/wire';

interface RecipeCardWire extends RecipeSummaryWire {
  description: string | null;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  cuisine: string | null;
  isFavorited?: boolean;
}

const DIFFICULTY = [
  { value: '', label: 'Any' },
  { value: 'EASY', label: 'Easy' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HARD', label: 'Hard' },
] as const;

export default function RecipesPage() {
  const api = useApi();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [difficulty, setDifficulty] = useState<string>('');

  // Search as you type, but not on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const results = useApiQuery(
    a =>
      a.client.get<{ recipes: RecipeCardWire[]; total: number }>(
        '/recipes/search',
        {
          params: {
            q: debounced || undefined,
            difficulty: difficulty || undefined,
            limit: 24,
          },
        }
      ),
    [debounced, difficulty]
  );

  const toggleFavourite = async (r: RecipeCardWire) => {
    const flip = (on: boolean) =>
      results.setData(d =>
        d
          ? {
              ...d,
              recipes: d.recipes.map(x =>
                x.id === r.id ? { ...x, isFavorited: on } : x
              ),
            }
          : d
      );
    flip(!r.isFavorited);
    try {
      if (r.isFavorited) await api.recipes.unfavorite(r.id);
      else await api.recipes.favorite(r.id);
    } catch {
      flip(!!r.isFavorited);
      toast.error('That could not be saved. Try again.');
    }
  };

  const recipes = results.data?.recipes ?? [];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-md">
        <h1 className="m-0 text-section text-ink">Recipes</h1>
        <Button asChild>
          <Link href="/dashboard/chat">
            <MessageSquare className="h-4 w-4" aria-hidden />
            Ask Petra for one
          </Link>
        </Button>
      </header>

      <div className="flex flex-col gap-sm">
        <label className="relative block">
          <span className="sr-only">Search recipes</span>
          <Search
            className="pointer-events-none absolute left-sm top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Harissa chicken, something warming, 20 minutes…"
            className={`${controlClass} pl-10`}
          />
        </label>
        <ChipRow label="Difficulty">
          {DIFFICULTY.map(d => (
            <Chip
              key={d.label}
              active={difficulty === d.value}
              onClick={() => setDifficulty(d.value)}
            >
              {d.label}
            </Chip>
          ))}
        </ChipRow>
      </div>

      {results.status === 'loading' && !results.data ? (
        <div className="grid grid-fill-260 gap-md" aria-label="Loading">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="aspect-[4/5] animate-pulse rounded-md bg-background"
            />
          ))}
        </div>
      ) : recipes.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={debounced ? 'No recipes match' : 'No recipes yet'}
          action={
            <Button asChild variant="secondary">
              <Link href="/dashboard/chat">Ask Petra instead</Link>
            </Button>
          }
        >
          {debounced
            ? 'Try fewer words, or ask Petra to write one from what you have.'
            : 'Ask Petra for a dish and it is saved here.'}
        </EmptyState>
      ) : (
        <ul
          className={cn(
            'm-0 grid list-none grid-fill-260 gap-md p-0',
            results.status === 'loading' && 'opacity-60'
          )}
        >
          {recipes.map(r => (
            <li key={r.id} className="relative min-w-0">
              <Link
                href={`/dashboard/recipes/${r.id}`}
                className="flex h-full flex-col overflow-hidden rounded-md border border-border bg-background active:bg-surface-soft"
              >
                <div className="relative aspect-[4/3] w-full bg-signature-cream">
                  {r.imageUrl ? (
                    <Image
                      src={r.imageUrl}
                      alt=""
                      fill
                      sizes="(min-width: 900px) 280px, 100vw"
                      className="object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-full items-center justify-center"
                      aria-hidden
                    >
                      <PantryArt name={r.title} size={72} />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-md">
                  <h2 className="m-0 text-lead leading-snug text-ink">
                    {r.title}
                  </h2>
                  <p className="m-0 text-label-sm text-muted-foreground">
                    {[
                      r.totalTime ? `${r.totalTime} min` : null,
                      r.difficulty.charAt(0) +
                        r.difficulty.slice(1).toLowerCase(),
                      r.cuisine,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => toggleFavourite(r)}
                aria-pressed={!!r.isFavorited}
                aria-label={
                  r.isFavorited
                    ? `Remove ${r.title} from saved`
                    : `Save ${r.title}`
                }
                className="absolute right-xs top-xs flex h-10 w-10 items-center justify-center rounded-full bg-background text-ink ring-1 ring-inset ring-border active:bg-secondary"
              >
                <Heart
                  className={cn(
                    'h-[18px] w-[18px]',
                    r.isFavorited && 'fill-current'
                  )}
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
