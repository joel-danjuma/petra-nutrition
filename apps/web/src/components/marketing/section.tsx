import type { ReactNode } from 'react';

import { Eyebrow } from '@/components/ds';
import { cn } from '@/lib/utils';

/**
 * One editorial band: the 1280px column, the fluid gutter, and the scaled
 * 96px rhythm below it. Every marketing section is one of these, so the
 * spacing between bands is decided once.
 */
export function Section({
  children,
  className,
  id,
  as: Tag = 'section',
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  as?: 'section' | 'div';
  labelledBy?: string;
}) {
  return (
    <Tag
      id={id}
      aria-labelledby={labelledBy}
      className={cn(
        'mx-auto w-full max-w-container px-gutter pb-band',
        className
      )}
    >
      {children}
    </Tag>
  );
}

/**
 * Eyebrow + headline, with an optional lede that sits beside the headline on
 * wide screens and below it on narrow ones.
 */
export function SectionHead({
  eyebrow,
  title,
  lede,
  id,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-xl flex flex-wrap items-end justify-between gap-x-10 gap-y-md',
        className
      )}
    >
      <div className="max-w-[24ch]">
        <Eyebrow className="text-label-sm">{eyebrow}</Eyebrow>
        <h2 id={id} className="m-0 mt-md text-section text-ink">
          {title}
        </h2>
      </div>
      {lede ? (
        <p className="m-0 max-w-[44ch] text-label-md leading-relaxed text-body">
          {lede}
        </p>
      ) : null}
    </div>
  );
}

/** The page-opening headline block on interior marketing pages. */
export function PageIntro({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mx-auto w-full max-w-container px-gutter pb-band pt-hero-top">
      <Eyebrow className="text-label-sm">{eyebrow}</Eyebrow>
      <h1 className="m-0 mt-[18px] max-w-[18ch] text-display text-ink">
        {title}
      </h1>
      {lede ? (
        <p className="m-0 mt-lg max-w-[54ch] text-lede text-body">{lede}</p>
      ) : null}
      {children}
    </header>
  );
}
