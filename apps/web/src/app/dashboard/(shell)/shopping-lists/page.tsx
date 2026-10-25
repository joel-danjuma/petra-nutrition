'use client';

import Link from 'next/link';
import { ShoppingBasket } from 'lucide-react';

import { ShoppingListView } from '@/components/app/shopping-list-view';
import { EmptyState } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { useApiQuery } from '@/hooks/use-api-query';
import type { ShoppingListListWire } from '@/lib/wire';

/**
 * Shopping opens straight onto the list you are working through — the newest
 * one not yet finished — with older lists underneath.
 */
export default function ShoppingPage() {
  const lists = useApiQuery(a =>
    a.client.get<ShoppingListListWire>('/shopping-lists', {
      params: { limit: 20, sortBy: 'createdAt', sortOrder: 'desc' },
    })
  );

  const all = lists.data?.shoppingLists ?? [];
  const current = all.find(l => !l.isCompleted) ?? null;
  const others = all.filter(l => l.id !== current?.id);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="m-0 text-section text-ink">Shopping</h1>

      {lists.status === 'loading' ? (
        <div
          className="h-64 max-w-[760px] animate-pulse rounded-md bg-background"
          aria-label="Loading"
        />
      ) : lists.needsPremium ? (
        <EmptyState
          icon={ShoppingBasket}
          title="Shopping lists are part of Premium"
          action={
            <Button asChild>
              <Link href="/dashboard/profile#subscription">See Premium</Link>
            </Button>
          }
        >
          Premium writes the list from your week and leaves off what is already
          in the kitchen.
        </EmptyState>
      ) : current ? (
        <>
          <h2 className="sr-only">{current.name}</h2>
          <ShoppingListView
            list={current}
            onChange={next =>
              lists.setData(d =>
                d
                  ? {
                      ...d,
                      shoppingLists: d.shoppingLists.map(l =>
                        l.id === next.id ? next : l
                      ),
                    }
                  : d
              )
            }
            onDeleted={lists.reload}
          />
        </>
      ) : (
        <EmptyState
          icon={ShoppingBasket}
          title="Nothing to buy"
          action={
            <Button asChild>
              <Link href="/dashboard/meal-plans">Write one from the week</Link>
            </Button>
          }
        >
          Lists are written from the week&apos;s plan, with what you already
          have left off.
        </EmptyState>
      )}

      {others.length ? (
        <section aria-labelledby="older-lists" className="mt-lg max-w-[760px]">
          <h2
            id="older-lists"
            className="m-0 mb-sm text-lead font-medium text-ink"
          >
            Other lists
          </h2>
          <ul className="m-0 list-none divide-y divide-border rounded-md border border-border bg-background p-0">
            {others.map(l => {
              const left = l.items.filter(i => !i.isCompleted).length;
              return (
                <li key={l.id}>
                  <Link
                    href={`/dashboard/shopping-lists/${l.id}`}
                    className="flex min-h-[56px] items-center justify-between gap-sm px-md py-sm active:bg-surface-soft"
                  >
                    <span className="min-w-0 truncate text-body-lg text-ink">
                      {l.name}
                    </span>
                    <span className="shrink-0 text-label-sm text-muted-foreground">
                      {l.isCompleted ? 'Done' : `${left} left`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
