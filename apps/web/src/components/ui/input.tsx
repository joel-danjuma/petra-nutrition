import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Text input: the system's small radius and its single hairline border. No
 * fill, no shadow — the focus ring is the only state change, and it is blue
 * rather than near-black so it stays visible against the control itself.
 */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex w-full rounded-sm border border-border bg-background px-sm py-sm',
        'text-label-md text-foreground placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:shadow-focus',
        'disabled:cursor-not-allowed disabled:border-[var(--border-strong)] disabled:text-muted-foreground',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[80px] w-full rounded-sm border border-border bg-background px-sm py-sm',
      'text-label-md text-foreground placeholder:text-muted-foreground',
      'focus-visible:outline-none focus-visible:shadow-focus',
      className
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label ref={ref} className={cn('text-label-md font-medium text-foreground', className)} {...props} />
));
Label.displayName = 'Label';

export { Input, Textarea, Label };
