'use client';

import { useState, type FormEvent } from 'react';
import { Check, Download, Loader2, Plus, Trash2 } from 'lucide-react';
import { LOCATION_LABEL, useApi } from '@petra/shared';
import toast from 'react-hot-toast';

import { controlClass } from '@/components/app/sheet';
import { ChecklistRow, Eyebrow } from '@/components/ds';
import { Button } from '@/components/ui/button';
import type { ShoppingItemWire, ShoppingListWire } from '@/lib/wire';

const qty = (i: ShoppingItemWire) => {
  const n = Number.isInteger(i.quantity)
    ? i.quantity
    : Math.round(i.quantity * 10) / 10;
  return i.unit === 'pcs' ? `×${n}` : `${n} ${i.unit}`;
};

/**
 * One shopping list as the redesign draws it: what is left at the top, each
 * item with why it is there, ticked items sinking to the bottom, and — for a
 * list written from a plan — what was left off because it is already in the
 * kitchen.
 */
export function ShoppingListView({
  list,
  onChange,
  onDeleted,
}: {
  list: ShoppingListWire;
  onChange: (next: ShoppingListWire) => void;
  /** Called after the list is deleted, so the page can move on. */
  onDeleted: () => void;
}) {
  const api = useApi();
  const [newItem, setNewItem] = useState('');
  const [adding, setAdding] = useState(false);

  const left = list.items.filter(i => !i.isCompleted).length;
  // Unticked first; within each group, keep the list's own order.
  const ordered = [...list.items].sort(
    (a, b) => Number(a.isCompleted) - Number(b.isCompleted)
  );

  const toggle = async (item: ShoppingItemWire) => {
    const updated = { ...item, isCompleted: !item.isCompleted };
    const before = list;
    onChange({
      ...list,
      items: list.items.map(i => (i.id === item.id ? updated : i)),
    });
    try {
      await api.client.patch(`/shopping-lists/${list.id}/items`, {
        items: [updated],
      });
    } catch {
      onChange(before);
      toast.error(`${item.name} could not be updated. Try again.`);
    }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const name = newItem.trim();
    if (!name) return;
    setAdding(true);
    try {
      const res = await api.client.patch<ShoppingListWire>(
        `/shopping-lists/${list.id}/items`,
        {
          items: [
            {
              name,
              quantity: 1,
              unit: 'pcs',
              category: 'OTHER',
              isCompleted: false,
            },
          ],
        }
      );
      if (!res.success || !res.data) throw new Error();
      onChange({
        ...res.data,
        skippedItems: res.data.skippedItems ?? list.skippedItems,
      });
      setNewItem('');
    } catch {
      toast.error(`${name} could not be added. Try again.`);
    } finally {
      setAdding(false);
    }
  };

  const exportCsv = async () => {
    try {
      const res = await api.client.get<string>(
        `/shopping-lists/${list.id}/export`,
        {
          params: { format: 'csv' },
          responseType: 'blob',
        }
      );
      const blob = res as unknown as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${list.name || 'shopping-list'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('The list could not be exported.');
    }
  };

  const markDone = async () => {
    try {
      const res = await api.client.post<ShoppingListWire>(
        `/shopping-lists/${list.id}/complete`
      );
      onChange({
        ...list,
        ...(res.data ?? {}),
        isCompleted: true,
        items: list.items,
      });
      toast.success('List marked as done');
    } catch {
      toast.error('The list could not be marked as done.');
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete “${list.name}”? This cannot be undone.`))
      return;
    try {
      await api.client.delete(`/shopping-lists/${list.id}`);
      toast.success('List deleted');
      onDeleted();
    } catch {
      toast.error('The list could not be deleted.');
    }
  };

  return (
    <div className="flex max-w-[760px] flex-col gap-5">
      <p className="m-0 text-body-lg text-muted-foreground" aria-live="polite">
        {left === 0
          ? 'Everything ticked off'
          : left === 1
            ? '1 thing left'
            : `${left} things left`}
        {list.mealPlanId ? ' · written from the plan' : ''}
      </p>

      {ordered.length ? (
        <ul className="m-0 list-none rounded-md border border-border bg-background p-0">
          {ordered.map(item => (
            <li
              key={item.id}
              className="px-md [&:last-child>button]:border-b-0"
            >
              <ChecklistRow
                name={item.name}
                quantity={qty(item)}
                reason={
                  // Which recipes need it, and any amount that could not be
                  // added in ("Also 76 cloves") — both, not one or the other.
                  [item.recipeName, item.notes].filter(Boolean).join(' · ') ||
                  undefined
                }
                category={item.category}
                done={item.isCompleted}
                onToggle={() => toggle(item)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 rounded-md bg-background p-md text-body-md text-muted-foreground">
          Nothing on this list yet.
        </p>
      )}

      <form onSubmit={add} className="flex gap-xs">
        <label htmlFor={`add-${list.id}`} className="sr-only">
          Add to the list
        </label>
        <input
          id={`add-${list.id}`}
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          placeholder="Add something"
          className={controlClass}
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={adding || !newItem.trim()}
        >
          {adding ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
          Add
        </Button>
      </form>

      {list.skippedItems?.length ? (
        <section
          aria-labelledby={`skipped-${list.id}`}
          className="rounded-md bg-signature-cream p-5"
        >
          <Eyebrow as="h2" className="mb-sm">
            <span id={`skipped-${list.id}`}>
              Skipped — already in your kitchen
            </span>
          </Eyebrow>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {list.skippedItems.map(s => (
              <li
                key={s.name}
                className="flex justify-between gap-sm text-body-md"
              >
                <span className="min-w-0 truncate text-ink">{s.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {s.have} in the{' '}
                  {LOCATION_LABEL[s.location]?.toLowerCase() ?? 'kitchen'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-xs border-t border-border pt-md">
        {list.isCompleted ? null : (
          <Button variant="secondary" onClick={markDone}>
            <Check className="h-4 w-4" aria-hidden />
            Mark as done
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={exportCsv}
          className="text-muted-foreground"
        >
          <Download className="h-4 w-4" aria-hidden />
          Export as CSV
        </Button>
        <Button variant="ghost" onClick={remove} className="text-app-danger">
          <Trash2 className="h-4 w-4" aria-hidden />
          Delete list
        </Button>
      </div>
    </div>
  );
}
