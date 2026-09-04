import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * The Petra Nutrition button.
 *
 * Signature pair: `default` (near-black CTA, the only shadow in the system) and
 * `secondary` (white with a hairline outline). `pill` and `legal` are
 * sub-system dialects — `pill` must never appear outside pricing surfaces, and
 * the primary is never recoloured to the link blue.
 *
 * There are no hover states by design: the system documents default and
 * active/pressed only, and a 10% alpha lift on near-black would be invisible
 * anyway. Focus shows the blue ring, which deliberately differs from primary.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-lg font-medium ' +
    'text-label-md transition-colors focus-visible:outline-none focus-visible:shadow-focus ' +
    'disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-button active:bg-[var(--color-primary-active)]',
        secondary: 'bg-background text-foreground ring-1 ring-inset ring-border active:bg-secondary',
        // The on-dark secondary stays a solid white button — the system never
        // inverts a button or makes it translucent over a signature surface.
        'secondary-on-dark': 'bg-background text-foreground active:bg-secondary',
        outline: 'bg-background text-foreground ring-1 ring-inset ring-border active:bg-secondary',
        ghost: 'text-foreground active:bg-secondary',
        destructive: 'bg-destructive text-destructive-foreground active:opacity-90',
        link: 'text-[var(--color-link)] underline-offset-4 underline active:text-[var(--color-link-active)]',
        // Pricing sub-system only: Inter dialect, pill radius.
        pill: 'rounded-pill bg-background font-pricing text-foreground ring-1 ring-inset ring-border active:bg-secondary',
        // Legal / cookie surfaces: the one place 600 weight is allowed.
        legal: 'rounded-xs bg-[var(--color-link)] text-white text-legal font-legal active:bg-[var(--color-link-active)]',
      },
      size: {
        default: 'px-lg py-md',
        sm: 'px-md py-sm text-body-md',
        lg: 'px-lg py-md',
        icon: 'h-10 w-10 rounded-pill p-0',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
