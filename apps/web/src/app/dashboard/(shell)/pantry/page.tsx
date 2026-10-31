'use client';

import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import * as Menu from '@radix-ui/react-dropdown-menu';
import {
  Camera,
  Loader2,
  Receipt,
  MoreHorizontal,
  Package,
  Plus,
  ScanBarcode,
  ScanLine,
  Search,
} from 'lucide-react';
import {
  byDaysLeft,
  daysLeft,
  isDueSoon,
  ITEM_CATEGORIES,
  LOCATION_LABEL,
  STORAGE_LOCATIONS,
  useApi,
  type ItemCategory,
  type ReceiptItem,
  type StorageLocation,
} from '@petra/shared';
import toast from 'react-hot-toast';

import { controlClass, Field, Sheet } from '@/components/app/sheet';
import { Chip, ChipRow, EmptyState, PantryTile } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { useApiQuery } from '@/hooks/use-api-query';
import type { PantryItemWire, PantryListWire } from '@/lib/wire';

type Filter = 'All' | StorageLocation | 'DUE';
const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: 'All', label: 'All' },
  { value: 'FRIDGE', label: 'Fridge' },
  { value: 'FREEZER', label: 'Freezer' },
  { value: 'PANTRY', label: 'Cupboard' },
  { value: 'DUE', label: 'Due soon' },
];

interface Draft {
  name: string;
  category: ItemCategory;
  quantity: string;
  unit: string;
  location: StorageLocation;
  expirationDate: string;
  brand: string;
}

const EMPTY_DRAFT: Draft = {
  name: '',
  category: 'OTHER',
  quantity: '1',
  unit: 'pcs',
  location: 'FRIDGE',
  expirationDate: '',
  brand: '',
};

const categoryLabel = (c: string) =>
  c.charAt(0) + c.slice(1).replace(/_/g, ' ').toLowerCase();

export default function PantryPage() {
  const api = useApi();
  const pantry = useApiQuery(a =>
    a.client.get<PantryListWire>('/pantry', {
      params: { limit: 100, sortBy: 'expirationDate' },
    })
  );

  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{
    id: string | null;
    draft: Draft;
  } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptItem[] | null>(null);

  const now = useMemo(() => new Date(), []);
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return byDaysLeft(pantry.data?.items ?? [], now).filter(i => {
      if (q && !i.name.toLowerCase().includes(q)) return false;
      if (filter === 'All') return true;
      if (filter === 'DUE') return isDueSoon(daysLeft(i.expirationDate, now));
      return i.location === filter;
    });
  }, [pantry.data, query, filter, now]);

  const remove = async (item: PantryItemWire, reason?: 'used' | 'wasted') => {
    const prev = pantry.data;
    pantry.setData(d =>
      d ? { ...d, items: d.items.filter(i => i.id !== item.id) } : d
    );
    try {
      await api.pantry.delete(item.id, reason);
      toast.success(
        reason === 'used'
          ? `${item.name} marked as used`
          : reason === 'wasted'
            ? `${item.name} logged as thrown away`
            : `${item.name} removed`
      );
    } catch {
      pantry.setData(() => prev);
      toast.error(`${item.name} could not be removed. Try again.`);
    }
  };

  if (pantry.needsPremium) {
    return (
      <>
        <PageHead count={null} />
        <EmptyState
          icon={Package}
          title="Pantry tracking is part of Premium"
          action={
            <Button asChild>
              <Link href="/dashboard/profile#subscription">See Premium</Link>
            </Button>
          }
        >
          Premium keeps track of what is in the fridge, freezer and cupboard,
          and when it turns — so every recipe starts from what you own.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHead
        count={pantry.data ? pantry.data.items.length : null}
        actions={
          <>
            <Button variant="secondary" onClick={() => setScanOpen(true)}>
              <ScanLine className="h-4 w-4" aria-hidden />
              Scan
            </Button>
            <Button
              onClick={() => setEditing({ id: null, draft: EMPTY_DRAFT })}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add
            </Button>
          </>
        }
      />

      <div className="mt-lg flex flex-col gap-sm">
        <label className="relative block">
          <span className="sr-only">Search the pantry</span>
          <Search
            className="pointer-events-none absolute left-sm top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search the pantry"
            className={`${controlClass} pl-10`}
          />
        </label>
        <ChipRow label="Filter the pantry">
          {FILTERS.map(f => (
            <Chip
              key={f.value}
              active={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Chip>
          ))}
        </ChipRow>
      </div>

      <div className="mt-md">
        {pantry.status === 'loading' ? (
          <div className="grid grid-fill-280 gap-xs" aria-label="Loading">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="h-[60px] animate-pulse rounded-sm bg-background"
              />
            ))}
          </div>
        ) : pantry.status === 'error' ? (
          <EmptyState
            icon={Package}
            title="The pantry did not load"
            action={
              <Button variant="secondary" onClick={pantry.reload}>
                Try again
              </Button>
            }
          >
            {pantry.error?.message}
          </EmptyState>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Package}
            title={
              pantry.data?.items.length
                ? 'Nothing here'
                : 'Your pantry is empty'
            }
            action={
              pantry.data?.items.length ? null : (
                <Button onClick={() => setScanOpen(true)}>
                  <ScanLine className="h-4 w-4" aria-hidden />
                  Scan something in
                </Button>
              )
            }
          >
            {pantry.data?.items.length
              ? 'No items match this filter.'
              : 'Scan a barcode, photograph a shelf, or add things by hand. Petra cooks from what is here.'}
          </EmptyState>
        ) : (
          <ul className="m-0 grid list-none grid-fill-280 gap-xs p-0">
            {items.map(item => (
              <li key={item.id} className="min-w-0">
                <PantryTile
                  name={item.name}
                  category={item.category}
                  days={daysLeft(item.expirationDate, now)}
                  detail={`${item.quantity} ${item.unit} · ${LOCATION_LABEL[item.location]}`}
                  trailing={
                    <RowMenu
                      name={item.name}
                      onEdit={() =>
                        setEditing({
                          id: item.id,
                          draft: {
                            name: item.name,
                            category: item.category,
                            quantity: String(item.quantity),
                            unit: item.unit,
                            location: item.location,
                            expirationDate:
                              item.expirationDate?.slice(0, 10) ?? '',
                            brand: item.brand ?? '',
                          },
                        })
                      }
                      onUsed={() => remove(item, 'used')}
                      onWasted={() => remove(item, 'wasted')}
                      onDelete={() => remove(item)}
                    />
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <ItemSheet
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          pantry.reload();
        }}
      />
      <ScanSheet
        open={scanOpen}
        onOpenChange={setScanOpen}
        onRecognised={draft => {
          setScanOpen(false);
          setEditing({ id: null, draft });
        }}
        onReceipt={items => {
          setScanOpen(false);
          setReceipt(items);
        }}
      />
      <ReceiptSheet
        items={receipt}
        onClose={() => setReceipt(null)}
        onSaved={() => {
          setReceipt(null);
          pantry.reload();
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ pieces */

function PageHead({
  count,
  actions,
}: {
  count: number | null;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-md">
      <div>
        <h1 className="m-0 text-section text-ink">Pantry</h1>
        {count !== null ? (
          <p className="m-0 mt-1 text-body-md text-muted-foreground">
            {count === 1 ? '1 item' : `${count} items`}, soonest to turn first
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex gap-xs">{actions}</div> : null}
    </header>
  );
}

function RowMenu({
  name,
  onEdit,
  onUsed,
  onWasted,
  onDelete,
}: {
  name: string;
  onEdit: () => void;
  onUsed: () => void;
  onWasted: () => void;
  onDelete: () => void;
}) {
  const item =
    'flex min-h-target cursor-default items-center rounded-sm px-sm text-body-md text-ink outline-none data-[highlighted]:bg-surface-soft';
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button
          type="button"
          aria-label={`Options for ${name}`}
          className="-mr-xs flex h-11 w-11 items-center justify-center rounded-sm text-muted-foreground active:bg-secondary"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-[200px] rounded-md border border-border bg-background p-1.5"
        >
          <Menu.Item className={item} onSelect={onUsed}>
            Used it
          </Menu.Item>
          <Menu.Item className={item} onSelect={onWasted}>
            Threw it away
          </Menu.Item>
          <Menu.Item className={item} onSelect={onEdit}>
            Edit
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Item className={`${item} text-app-danger`} onSelect={onDelete}>
            Remove without logging
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

function ItemSheet({
  editing,
  onClose,
  onSaved,
}: {
  editing: { id: string | null; draft: Draft } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useApi();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [lastKey, setLastKey] = useState<string | null>(null);

  // Reset the form each time the sheet opens on a different item.
  const key = editing ? `${editing.id ?? 'new'}:${editing.draft.name}` : null;
  if (key !== lastKey) {
    setLastKey(key);
    if (editing) setDraft(editing.draft);
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft(d => ({ ...d, [k]: v }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    const body = {
      name: draft.name.trim(),
      category: draft.category,
      quantity: Number(draft.quantity) || 0,
      unit: draft.unit.trim() || 'pcs',
      location: draft.location,
      // The API takes a date; the shared type says Date, the wire says string.
      expirationDate: draft.expirationDate || undefined,
      brand: draft.brand.trim() || undefined,
    };
    try {
      if (editing.id) await api.client.patch(`/pantry/${editing.id}`, body);
      else await api.client.post('/pantry', body);
      toast.success(editing.id ? `${body.name} updated` : `${body.name} added`);
      onSaved();
    } catch (err) {
      toast.error(
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'That could not be saved. Try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={editing !== null}
      onOpenChange={o => !o && onClose()}
      title={editing?.id ? 'Edit item' : 'Add to the pantry'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="pantry-item-form"
            disabled={saving || !draft.name.trim()}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            {editing?.id ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <form
        id="pantry-item-form"
        onSubmit={save}
        className="flex flex-col gap-md"
      >
        <Field label="Name" htmlFor="pi-name">
          <input
            id="pi-name"
            required
            autoFocus
            value={draft.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Greek yoghurt"
            className={controlClass}
          />
        </Field>
        <div className="grid grid-cols-2 gap-sm">
          <Field label="Quantity" htmlFor="pi-qty">
            <input
              id="pi-qty"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={draft.quantity}
              onChange={e => set('quantity', e.target.value)}
              className={controlClass}
            />
          </Field>
          <Field label="Unit" htmlFor="pi-unit">
            <input
              id="pi-unit"
              value={draft.unit}
              onChange={e => set('unit', e.target.value)}
              placeholder="g, ml, pcs"
              className={controlClass}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-sm min-[420px]:grid-cols-2">
          <Field label="Kept in" htmlFor="pi-loc">
            <select
              id="pi-loc"
              value={draft.location}
              onChange={e => set('location', e.target.value as StorageLocation)}
              className={controlClass}
            >
              {STORAGE_LOCATIONS.map(l => (
                <option key={l} value={l}>
                  {LOCATION_LABEL[l]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Use by" htmlFor="pi-exp">
            <input
              id="pi-exp"
              type="date"
              value={draft.expirationDate}
              onChange={e => set('expirationDate', e.target.value)}
              className={controlClass}
            />
          </Field>
        </div>
        <Field label="Category" htmlFor="pi-cat">
          <select
            id="pi-cat"
            value={draft.category}
            onChange={e => set('category', e.target.value as ItemCategory)}
            className={controlClass}
          >
            {ITEM_CATEGORIES.map(c => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Brand (optional)" htmlFor="pi-brand">
          <input
            id="pi-brand"
            value={draft.brand}
            onChange={e => set('brand', e.target.value)}
            className={controlClass}
          />
        </Field>
      </form>
    </Sheet>
  );
}

/**
 * Scan in one item, by barcode or by photo; either way the result opens in the
 * item form to check before it is saved — recognition is a guess, and the
 * date on the label is the part that matters most.
 */
function ScanSheet({
  open,
  onOpenChange,
  onRecognised,
  onReceipt,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onRecognised: (draft: Draft) => void;
  onReceipt: (items: ReceiptItem[]) => void;
}) {
  const api = useApi();
  const [barcode, setBarcode] = useState('');
  const [busy, setBusy] = useState<null | 'barcode' | 'photo' | 'receipt'>(
    null
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const receiptRef = useRef<HTMLInputElement>(null);

  const onReceiptPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy('receipt');
    try {
      const receipt = await api.pantry.readReceipt(file);
      if (receipt.items.length === 0) {
        toast.error(
          'No food lines could be read. Try a flatter, closer photo.'
        );
        return;
      }
      onReceipt(receipt.items);
    } catch {
      toast.error(
        'Petra could not read that receipt. Try again in better light.'
      );
    } finally {
      setBusy(null);
      if (receiptRef.current) receiptRef.current.value = '';
    }
  };

  const toDraft = (r: {
    name: string;
    category: string;
    brand?: string;
    estimatedQuantity?: number;
    unit?: string;
  }): Draft => ({
    ...EMPTY_DRAFT,
    name: r.name,
    category: (ITEM_CATEGORIES as readonly string[]).includes(
      r.category.toUpperCase()
    )
      ? (r.category.toUpperCase() as ItemCategory)
      : 'OTHER',
    quantity: r.estimatedQuantity ? String(r.estimatedQuantity) : '1',
    unit: r.unit ?? 'pcs',
    brand: r.brand ?? '',
  });

  const lookUp = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('barcode');
    try {
      const product = await api.pantry.scanBarcode({
        barcode: barcode.replace(/\D/g, ''),
      });
      if (!product) throw new Error();
      setBarcode('');
      onRecognised(toDraft(product));
    } catch {
      toast.error(
        'That barcode is not in the product database. Add it by hand instead.'
      );
    } finally {
      setBusy(null);
    }
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy('photo');
    try {
      const recognised = await api.pantry.uploadImage(file, 'pantry_item');
      if (!recognised) throw new Error();
      onRecognised(toDraft(recognised));
    } catch {
      toast.error(
        'Petra could not read that photo. Try again closer to the label.'
      );
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Scan something in"
      description="You will get to check it before it goes in the pantry."
    >
      <div className="flex flex-col gap-lg">
        <form onSubmit={lookUp} className="flex flex-col gap-sm">
          <Field label="Barcode" htmlFor="scan-barcode">
            <div className="flex gap-xs">
              <input
                id="scan-barcode"
                inputMode="numeric"
                autoComplete="off"
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                placeholder="The digits under the bars"
                className={controlClass}
              />
              <Button
                type="submit"
                disabled={
                  busy !== null || barcode.replace(/\D/g, '').length < 6
                }
              >
                {busy === 'barcode' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <ScanBarcode className="h-4 w-4" aria-hidden />
                )}
                Look up
              </Button>
            </div>
          </Field>
        </form>

        <div className="flex flex-col gap-sm border-t border-border pt-lg">
          <p className="m-0 text-body-md font-medium text-ink">Photograph it</p>
          <p className="m-0 text-body-md text-muted-foreground">
            Petra reads the item and the date off the label.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            id="scan-photo"
            onChange={e => onPhoto(e.target.files?.[0])}
          />
          <Button
            variant="secondary"
            className="self-start"
            disabled={busy !== null}
            onClick={() => fileRef.current?.click()}
          >
            {busy === 'photo' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Camera className="h-4 w-4" aria-hidden />
            )}
            {busy === 'photo' ? 'Reading the label…' : 'Take or choose a photo'}
          </Button>
        </div>

        <div className="flex flex-col gap-sm border-t border-border pt-lg">
          <p className="m-0 text-body-md font-medium text-ink">
            Photograph a receipt
          </p>
          <p className="m-0 text-body-md text-muted-foreground">
            Petra lists the food on it with a use-by estimate. You check the
            list before anything is added.
          </p>
          <input
            ref={receiptRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            id="scan-receipt"
            onChange={e => onReceiptPhoto(e.target.files?.[0])}
          />
          <Button
            variant="secondary"
            className="self-start"
            disabled={busy !== null}
            onClick={() => receiptRef.current?.click()}
          >
            {busy === 'receipt' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Receipt className="h-4 w-4" aria-hidden />
            )}
            {busy === 'receipt'
              ? 'Reading the receipt…'
              : 'Take or choose a photo'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/* ----------------------------------------------------------------- receipt */

/** Where a receipt item most likely lives, from its category. */
const placeFor = (category: string): StorageLocation => {
  const c = category.toUpperCase();
  if (c === 'FROZEN') return 'FREEZER';
  if (['DAIRY', 'MEAT', 'SEAFOOD', 'PRODUCE'].includes(c)) return 'FRIDGE';
  return 'PANTRY';
};

const dateIn = (days: number | undefined) => {
  if (days === undefined) return '';
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

interface ReceiptRow {
  keep: boolean;
  name: string;
  category: ItemCategory;
  quantity: number;
  unit: string;
  location: StorageLocation;
  expirationDate: string;
}

/**
 * The list read off a receipt, to correct before it becomes pantry rows.
 * Everything starts ticked; untick what you do not want, fix a name or a date.
 */
function ReceiptSheet({
  items,
  onClose,
  onSaved,
}: {
  items: ReceiptItem[] | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useApi();
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [source, setSource] = useState<ReceiptItem[] | null>(null);
  const [saving, setSaving] = useState(false);

  if (items !== source) {
    setSource(items);
    setRows(
      (items ?? []).map(i => ({
        keep: true,
        name: i.name,
        category: (ITEM_CATEGORIES as readonly string[]).includes(
          i.category.toUpperCase()
        )
          ? (i.category.toUpperCase() as ItemCategory)
          : 'OTHER',
        quantity: i.quantity ?? 1,
        unit: i.unit ?? 'pcs',
        location: placeFor(i.category),
        expirationDate: dateIn(i.expiresInDays),
      }))
    );
  }

  const patch = (idx: number, p: Partial<ReceiptRow>) =>
    setRows(rs => rs.map((r, i) => (i === idx ? { ...r, ...p } : r)));

  const kept = rows.filter(r => r.keep && r.name.trim());

  const save = async () => {
    setSaving(true);
    const results = await Promise.allSettled(
      kept.map(r =>
        api.client.post('/pantry', {
          name: r.name.trim(),
          category: r.category,
          quantity: r.quantity,
          unit: r.unit,
          location: r.location,
          expirationDate: r.expirationDate || undefined,
        })
      )
    );
    const failed = results.filter(r => r.status === 'rejected').length;
    setSaving(false);
    if (failed === 0) {
      toast.success(
        kept.length === 1 ? '1 item added' : `${kept.length} items added`
      );
    } else {
      toast.error(
        `${kept.length - failed} added, ${failed} could not be saved.`
      );
    }
    onSaved();
  };

  return (
    <Sheet
      open={items !== null}
      onOpenChange={o => !o && onClose()}
      title="Check the receipt"
      description="Use-by dates are estimates unless the receipt printed one."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || kept.length === 0}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            {kept.length === 1 ? 'Add 1 item' : `Add ${kept.length} items`}
          </Button>
        </>
      }
    >
      <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
        {rows.map((r, idx) => (
          <li
            key={idx}
            className={`flex items-start gap-sm py-sm ${r.keep ? '' : 'opacity-50'}`}
          >
            <input
              type="checkbox"
              checked={r.keep}
              onChange={e => patch(idx, { keep: e.target.checked })}
              aria-label={`Add ${r.name}`}
              className="mt-3 h-5 w-5 shrink-0 accent-[var(--petra-ink)]"
            />
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-xs min-[420px]:grid-cols-[1fr_auto]">
              <input
                value={r.name}
                onChange={e => patch(idx, { name: e.target.value })}
                aria-label="Name"
                className={controlClass}
              />
              <input
                type="date"
                value={r.expirationDate}
                onChange={e => patch(idx, { expirationDate: e.target.value })}
                aria-label={`Use by date for ${r.name}`}
                className={controlClass}
              />
              <p className="m-0 text-label-sm text-muted-foreground min-[420px]:col-span-2">
                {r.quantity} {r.unit} · {LOCATION_LABEL[r.location]}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
