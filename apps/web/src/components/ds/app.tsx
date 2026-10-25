import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import Image from 'next/image';
import { Check, type LucideIcon } from 'lucide-react';
import {
  dueLabel,
  pantryArtFor,
  pantryUrgency,
  type ItemCategory,
  type PantryArt as PantryArtName,
} from '@petra/shared/src/core';

import { cn } from '@/lib/utils';

/**
 * The product-UI layer of the Petra design system (`components/app/` in the
 * design-system project), plus the pieces the redesign repeats across screens.
 *
 * Everything here is composed from existing tokens: no new hue, size, radius
 * or shadow. Interactive pieces define default and pressed states only — the
 * system documents no hover.
 */

/* ------------------------------------------------------------------ Eyebrow */

/** The small uppercase label above a heading or a group. */
export function Eyebrow({
  children,
  className,
  as: Tag = 'p',
}: {
  children: ReactNode;
  className?: string;
  as?: 'p' | 'span' | 'h2' | 'h3';
}) {
  return (
    <Tag
      className={cn(
        'm-0 text-eyebrow font-medium uppercase text-muted-foreground',
        className
      )}
    >
      {children}
    </Tag>
  );
}

/* --------------------------------------------------------------- PantryArt */

export interface PantryArtProps {
  /** Either an explicit illustration, or an item to pick one for. */
  art?: PantryArtName;
  name?: string;
  category?: ItemCategory | null;
  size?: 32 | 40 | 44 | 56 | 72;
  className?: string;
}

/** One of the sixteen pantry illustrations. Decorative — always `alt=""`. */
export function PantryArt({
  art,
  name,
  category,
  size = 40,
  className,
}: PantryArtProps) {
  const stem = art ?? pantryArtFor(name ?? '', category);
  return (
    <Image
      src={`/illustrations/petra-${stem}.svg`}
      alt=""
      width={size}
      height={size}
      // Static vector files; the image optimiser does not rasterise SVG.
      unoptimized
      className={cn('shrink-0 select-none', className)}
      draggable={false}
    />
  );
}

/* --------------------------------------------------------------- PantryTile */

export interface PantryTileProps {
  name: string;
  category?: ItemCategory | null;
  /** Quantity and place, e.g. "Half a bag · Fridge". */
  detail?: ReactNode;
  /** From `daysLeft()`; null when the item has no date. */
  days: number | null;
  /** `row` is the pantry list; `compact` is the two-up grid in summary cards. */
  variant?: 'row' | 'compact';
  /** Overrides the due label (e.g. "Have" on a recipe). */
  dueText?: string;
  trailing?: ReactNode;
  className?: string;
}

const dueTone = (days: number | null) => {
  const u = pantryUrgency(days);
  if (u === 'expired' || u === 'today') return 'text-app-danger';
  if (u === 'soon') return 'text-ink';
  return 'text-muted-foreground';
};

/**
 * A pantry item with its illustration and how long it has left. Anything due
 * within three days sits on cream; an item due today is called out in coral.
 */
export function PantryTile({
  name,
  category,
  detail,
  days,
  variant = 'row',
  dueText,
  trailing,
  className,
}: PantryTileProps) {
  const u = pantryUrgency(days);
  const soon = u === 'expired' || u === 'today' || u === 'soon';
  const due = dueText ?? dueLabel(days);

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'flex min-w-0 items-center gap-2.5 rounded-sm p-2.5',
          soon ? 'bg-app-warning' : 'bg-surface-soft',
          className
        )}
      >
        <PantryArt name={name} category={category} size={44} />
        <div className="min-w-0">
          <p className="m-0 line-clamp-2 text-body-md leading-snug text-ink">
            {name}
          </p>
          <p
            className={cn('m-0 mt-0.5 text-eyebrow font-medium', dueTone(days))}
          >
            {due}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex min-h-[60px] items-center justify-between gap-sm rounded-sm px-md py-2.5',
        soon ? 'bg-app-warning' : 'bg-background ring-1 ring-inset ring-border',
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-sm">
        <PantryArt name={name} category={category} size={40} />
        <div className="min-w-0">
          <p className="m-0 truncate text-body-lg text-ink">{name}</p>
          {detail ? (
            <p className="m-0 mt-0.5 truncate text-label-sm text-muted-foreground">
              {detail}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-xs">
        <span className={cn('text-label-sm font-medium', dueTone(days))}>
          {due}
        </span>
        {trailing}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- Chip */

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

/**
 * A selectable tag. `--radius-sm`, never the pill: the pill radius is a
 * pricing sub-system signal, so a pill chip would misread as a pricing control.
 */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(
  ({ active = false, className, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-3.5',
        'text-body-md font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground active:bg-[var(--color-primary-active)]'
          : 'bg-background text-body ring-1 ring-inset ring-border active:bg-secondary',
        className
      )}
      {...props}
    />
  )
);
Chip.displayName = 'Chip';

/** A row of chips that scrolls sideways inside itself on narrow screens. */
export function ChipRow({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  /** Accessible name for the group, e.g. "Filter by place". */
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('scroll-row gap-xs', className)}
    >
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------- StatTile */

/** A single figure with what it measures. */
export function StatTile({
  value,
  label,
  caption,
  className,
}: {
  value: ReactNode;
  label: ReactNode;
  caption?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <p className="m-0 text-body-md text-muted-foreground">{label}</p>
      <p className="m-0 text-section text-ink tabular-nums">{value}</p>
      {caption ? (
        <p className="m-0 text-label-sm text-muted-foreground">{caption}</p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- ChecklistRow */

export interface ChecklistRowProps {
  name: string;
  quantity?: ReactNode;
  /** Why it is on the list: "Thursday · spinach dal", "Running low". */
  reason?: ReactNode;
  done: boolean;
  onToggle: () => void;
  category?: ItemCategory | null;
  disabled?: boolean;
  className?: string;
}

/** One shopping-list item. The whole row is the target, not just the box. */
export function ChecklistRow({
  name,
  quantity,
  reason,
  done,
  onToggle,
  category,
  disabled,
  className,
}: ChecklistRowProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'flex w-full min-h-[64px] items-center gap-sm border-b border-border py-sm text-left',
        'active:bg-secondary disabled:opacity-60',
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-sm',
          done
            ? 'bg-primary text-primary-foreground'
            : 'bg-background text-transparent ring-[1.5px] ring-inset ring-muted-foreground'
        )}
      >
        <Check className="h-4 w-4" strokeWidth={2.25} />
      </span>
      <PantryArt name={name} category={category} size={40} />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-body-lg',
            done ? 'text-muted-foreground line-through' : 'text-ink'
          )}
        >
          {name}
        </span>
        {reason ? (
          <span className="mt-0.5 block truncate text-label-sm text-muted-foreground">
            {reason}
          </span>
        ) : null}
      </span>
      {quantity ? (
        <span className="shrink-0 text-body-md text-muted-foreground tabular-nums">
          {quantity}
        </span>
      ) : null}
    </button>
  );
}

/* --------------------------------------------------------------- EmptyState */

/**
 * The quiet empty state: a thin outline icon in muted ink, a 400-weight title,
 * one calm sentence. Nothing coloured — an empty list is not an error.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-sm px-lg py-xxl text-center',
        className
      )}
    >
      <Icon
        className="h-8 w-8 text-muted-foreground"
        strokeWidth={1.5}
        aria-hidden
      />
      <h2 className="m-0 text-title-md text-ink">{title}</h2>
      {children ? (
        <p className="m-0 max-w-[40ch] text-body-lg text-body">{children}</p>
      ) : null}
      {action ? <div className="mt-xs">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------- ProgressRow */

/** A labelled bar. The fill is ink: progress is not a success state. */
export function ProgressRow({
  label,
  value,
  max,
  display,
  className,
}: {
  label: ReactNode;
  value: number;
  max: number;
  /** What to print on the right; defaults to "value / max". */
  display?: ReactNode;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-sm text-body-md">
        <span className="text-body">{label}</span>
        <span className="text-ink tabular-nums">
          {display ?? `${value} / ${max}`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="h-1 overflow-hidden rounded-full bg-surface-strong"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- FactGrid */

/** The label-over-value grid on a recipe: Time · To buy · Clears · Per serving. */
export function FactGrid({
  facts,
  className,
  tone = 'light',
}: {
  facts: ReadonlyArray<{ label: string; value: ReactNode }>;
  className?: string;
  tone?: 'light' | 'dark';
}) {
  return (
    <dl
      className={cn(
        'm-0 grid grid-cols-2 gap-px overflow-hidden rounded-md sm:grid-cols-4',
        tone === 'dark' ? 'bg-on-dark-hairline' : 'bg-border',
        className
      )}
    >
      {facts.map(f => (
        <div
          key={f.label}
          className={cn(
            'flex flex-col gap-1 px-md py-sm',
            tone === 'dark' ? 'bg-signature-dark' : 'bg-background'
          )}
        >
          <dt
            className={cn(
              'text-eyebrow font-medium uppercase',
              tone === 'dark' ? 'text-on-dark-muted' : 'text-muted-foreground'
            )}
          >
            {f.label}
          </dt>
          <dd
            className={cn(
              'm-0 text-lead',
              tone === 'dark' ? 'text-white' : 'text-ink'
            )}
          >
            {f.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
