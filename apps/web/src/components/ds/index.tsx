import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The Petra Nutrition marketing kit, vendored from the design-system project
 * (`components/marketing`, `components/cards`).
 *
 * The upstream components inject their own CSS at runtime; here the same rules
 * live in `src/styles/globals.css` under the identical class names, so the
 * markup is unchanged but the styling is present on the server render. Keep the
 * class names in sync with upstream — they are the contract.
 */

/* ----------------------------------------------------------------- HeroBand */

export interface HeroBandProps {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  /** `center` is the homepage default; `left` is used on interior pages. */
  align?: 'center' | 'left';
  children?: React.ReactNode;
  className?: string;
}

export function HeroBand({
  eyebrow,
  title,
  subtitle,
  primaryLabel = 'Sign up for free',
  secondaryLabel = 'Book demo',
  onPrimary,
  onSecondary,
  align = 'center',
  children,
  className,
}: HeroBandProps) {
  return (
    <section className={cn('petra-hero', `petra-hero--${align}`, className)}>
      <div className="petra-hero__inner">
        {eyebrow ? <p className="petra-hero__eyebrow">{eyebrow}</p> : null}
        <h1 className="petra-hero__title">{title}</h1>
        {subtitle ? <p className="petra-hero__sub">{subtitle}</p> : null}
        {primaryLabel || secondaryLabel ? (
          <div className="petra-hero__cta">
            {primaryLabel ? <Button onClick={onPrimary}>{primaryLabel}</Button> : null}
            {secondaryLabel ? (
              <Button variant="secondary" onClick={onSecondary}>
                {secondaryLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- SignatureCard */

export interface SignatureCardProps {
  variant?: 'coral' | 'forest' | 'dark';
  eyebrow?: string;
  title: React.ReactNode;
  body?: React.ReactNode;
  ctaLabel?: string;
  onCta?: () => void;
  media?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function SignatureCard({
  variant = 'coral',
  eyebrow,
  title,
  body,
  ctaLabel,
  onCta,
  media,
  children,
  className,
}: SignatureCardProps) {
  return (
    <section
      className={cn('petra-sig', `petra-sig--${variant}`, media && 'petra-sig--split', className)}
    >
      <div className="petra-sig__inner">
        <div>
          {eyebrow ? <p className="petra-sig__eyebrow">{eyebrow}</p> : null}
          <h2 className="petra-sig__title">{title}</h2>
          {body ? <p className="petra-sig__body">{body}</p> : null}
          {children}
          {ctaLabel ? (
            <div className="petra-sig__cta">
              {/* Stays a solid white button — the system never inverts or
                  makes a button translucent over a signature surface. */}
              <Button variant="secondary-on-dark" onClick={onCta}>
                {ctaLabel}
              </Button>
            </div>
          ) : null}
        </div>
        {media ? <div className="petra-sig__media">{media}</div> : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ CreamCallout */

export interface CreamCalloutProps {
  eyebrow?: string;
  title: React.ReactNode;
  body?: React.ReactNode;
  ctaLabel?: string;
  onCta?: () => void;
  media?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function CreamCallout({
  eyebrow,
  title,
  body,
  ctaLabel,
  onCta,
  media,
  children,
  className,
}: CreamCalloutProps) {
  return (
    <section className={cn('petra-cream', media && 'petra-cream--split', className)}>
      <div className="petra-cream__inner">
        <div>
          {eyebrow ? <p className="petra-cream__eyebrow">{eyebrow}</p> : null}
          <h3 className="petra-cream__title">{title}</h3>
          {body ? <p className="petra-cream__body">{body}</p> : null}
          {children}
          {ctaLabel ? (
            <div className="petra-cream__cta">
              <Button variant="secondary" size="sm" onClick={onCta}>
                {ctaLabel}
              </Button>
            </div>
          ) : null}
        </div>
        {media ? <div className="petra-cream__media">{media}</div> : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ CtaBandLight */

export interface CtaBandLightProps {
  title: React.ReactNode;
  body?: React.ReactNode;
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  className?: string;
}

export function CtaBandLight({
  title,
  body,
  primaryLabel = 'Get started for free',
  secondaryLabel,
  onPrimary,
  onSecondary,
  className,
}: CtaBandLightProps) {
  return (
    <section className={cn('petra-ctaband', className)}>
      <div>
        <h2 className="petra-ctaband__title">{title}</h2>
        {body ? <p className="petra-ctaband__body">{body}</p> : null}
      </div>
      <div className="petra-ctaband__cta">
        {secondaryLabel ? (
          <Button variant="secondary" onClick={onSecondary}>
            {secondaryLabel}
          </Button>
        ) : null}
        {primaryLabel ? <Button onClick={onPrimary}>{primaryLabel}</Button> : null}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- LogoStrip */

export interface LogoStripProps {
  label?: string;
  logos: string[];
  className?: string;
}

/** No logo assets were provided to the system, so partner names are set in type. */
export function LogoStrip({ label, logos, className }: LogoStripProps) {
  return (
    <div className={cn('petra-logostrip', className)}>
      {label ? <span className="petra-logostrip__label">{label}</span> : null}
      <div className="petra-logostrip__row">
        {logos.map(logo => (
          <span key={logo} className="petra-logostrip__logo">
            {logo}
          </span>
        ))}
      </div>
    </div>
  );
}
