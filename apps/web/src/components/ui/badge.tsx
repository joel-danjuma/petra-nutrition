import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Small informational tag — recipe difficulty, cuisine, a plan label.
 *
 * Deliberately NOT pill-shaped: `--radius-pill` is a pricing sub-system signal
 * in this design system, so badges take the small "inline control" radius so
 * they can't read as a pricing element.
 *
 * The uppercase `category` variant is the one casing exception the system
 * allows — it documents sentence case everywhere except small category tags.
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-sm px-xs py-xxs text-caption font-medium',
  {
    variants: {
      variant: {
        default: 'bg-secondary text-foreground',
        outline: 'border border-border text-foreground',
        solid: 'bg-primary text-primary-foreground',
        success: 'text-success',
        warning: 'bg-warning text-warning-foreground',
        destructive: 'text-destructive',
        category: 'uppercase tracking-[0.08em] text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
