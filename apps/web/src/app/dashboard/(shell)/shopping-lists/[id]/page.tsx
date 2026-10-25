'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShoppingBasket } from 'lucide-react';

import { ShoppingListView } from '@/components/app/shopping-list-view';
import { EmptyState } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { useApiQuery } from '@/hooks/use-api-query';
import type { ShoppingListWire } from '@/lib/wire';

export default function ShoppingListPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const list = useApiQuery(
    a => a.client.get<ShoppingListWire>(`/shopping-lists/${params.id}`),
    [params.id]
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex min-w-0 items-center gap-xs">
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="-ml-sm"
          aria-label="All shopping lists"
        >
          <Link href="/dashboard/shopping-lists">
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>
        </Button>
        <h1 className="m-0 min-w-0 truncate text-section text-ink">
          {list.data?.name ?? 'Shopping list'}
        </h1>
      </header>

      {list.status === 'loading' ? (
        <div
          className="h-64 max-w-[760px] animate-pulse rounded-md bg-background"
          aria-label="Loading"
        />
      ) : list.data ? (
        <ShoppingListView
          list={list.data}
          onChange={next => list.setData(() => next)}
          onDeleted={() => router.push('/dashboard/shopping-lists')}
        />
      ) : (
        <EmptyState icon={ShoppingBasket} title="That list is not here">
          It may have been deleted.
        </EmptyState>
      )}
    </div>
  );
}
