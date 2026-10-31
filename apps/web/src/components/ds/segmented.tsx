'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------- Segmented */

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /**
   * `square` is the general control (6px radius, equal-width cells).
   * `pill` is the pricing sub-system's Monthly / Annual switch — pricing only.
   */
  variant?: 'square' | 'pill';
  className?: string;
  id?: string;
}

/** A single-choice control: "Cooking for 1 / 2 / 3–4 / 5+", "Monthly / Annual". */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  variant = 'square',
  className,
  id,
}: SegmentedProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  // Arrow keys move the selection, as in a native radio group.
  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={label}
      className={cn(
        variant === 'pill'
          ? 'inline-flex gap-1 rounded-pill bg-surface-soft p-1'
          : 'grid gap-xs',
        className
      )}
      style={
        variant === 'square'
          ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }
          : undefined
      }
    >
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={el => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={e => onKeyDown(e, i)}
            className={cn(
              'min-h-10 whitespace-nowrap transition-colors',
              variant === 'pill'
                ? 'rounded-pill px-[18px] font-pricing text-body-md font-mid-strong'
                : 'min-h-target rounded-sm text-body-lg font-medium',
              checked
                ? 'bg-primary text-primary-foreground'
                : variant === 'pill'
                  ? 'bg-transparent text-muted-foreground active:bg-background'
                  : 'bg-background text-body ring-1 ring-inset ring-border active:bg-secondary'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
