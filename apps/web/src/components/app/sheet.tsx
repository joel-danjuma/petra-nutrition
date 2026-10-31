'use client';

import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * A modal sheet: pinned to the bottom edge on a phone (where the thumb is),
 * centred on wider screens. Radix supplies the focus trap, Esc and scroll lock.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Opacity on the element, not the colour: the token is a plain hex var,
            which Tailwind's /40 modifier cannot reach into. */}
        <Dialog.Overlay className="fixed inset-0 z-50 bg-signature-dark opacity-40" />
        <Dialog.Content
          // With a description Radix wires aria-describedby itself; without one,
          // say so explicitly rather than let it warn.
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'fixed z-50 flex max-h-[min(92dvh,760px)] flex-col bg-background focus:outline-none',
            // phone: bottom sheet
            'inset-x-0 bottom-0 rounded-t-lg pb-safe',
            // ≥640px: centred dialog
            'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(520px,calc(100vw-32px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:pb-0',
            className
          )}
        >
          <div className="flex items-start justify-between gap-md border-b border-border px-lg py-md">
            <div className="min-w-0">
              <Dialog.Title className="m-0 text-title-md text-ink">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="m-0 mt-1 text-body-md text-muted-foreground">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close"
                className="-mr-sm -mt-1"
              >
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-lg py-md">
            {children}
          </div>
          {footer ? (
            <div className="flex flex-wrap justify-end gap-sm border-t border-border px-lg py-md">
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Label above a control, with the system's input styling for selects and text. */
export function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-body-md font-medium text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Shared control classes: 44px tall, 16px text so iOS does not zoom on focus. */
export const controlClass =
  'block min-h-target w-full rounded-sm border border-border bg-background px-sm text-label-md text-ink ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:shadow-focus';
