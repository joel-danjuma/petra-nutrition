import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * A card is defined by its surface colour and radius against the white canvas —
 * never by a shadow or a coloured border. Depth comes from colour contrast.
 *
 * `content` is the everyday 10px card. The signature surfaces (coral / forest /
 * dark / cream) are 12px, generously padded, and carry their type across the
 * whole card; they are never used as small accents or tints.
 */
const cardVariants = cva('', {
  variants: {
    surface: {
      content: 'bg-card text-card-foreground rounded-md border border-border',
      soft: 'bg-secondary text-foreground rounded-md',
      cream: 'bg-signature-cream text-foreground rounded-md',
      coral: 'bg-signature-coral text-white rounded-lg',
      forest: 'bg-signature-forest text-white rounded-lg',
      dark: 'bg-signature-dark text-white rounded-lg',
    },
    padded: {
      true: '',
      false: 'p-0',
    },
  },
  compoundVariants: [
    // Signature cards are 48px-padded; content and cream sit tighter at 24px.
    { surface: ['coral', 'forest', 'dark'], padded: true, class: 'p-xxl' },
    { surface: ['content', 'soft', 'cream'], padded: true, class: 'p-lg' },
  ],
  defaultVariants: { surface: 'content', padded: true },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, surface, padded, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ surface, padded }), className)} {...props} />
  )
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-xs', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-title-sm font-medium', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-body-md text-muted-foreground', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('', className)} {...props} />
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center gap-xs', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, cardVariants };
