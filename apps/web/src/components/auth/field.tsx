'use client';

import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Sits at the right of the label row, e.g. "Forgot it?". */
  aside?: ReactNode;
  hint?: string;
  error?: string;
}

/**
 * The auth forms' input: label above, 52px tall, 16px text (so iOS does not
 * zoom on focus). Password fields get a show/hide toggle.
 */
export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(
  (
    { label, aside, hint, error, type = 'text', className, id, ...props },
    ref
  ) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const describedBy = error
      ? `${inputId}-error`
      : hint
        ? `${inputId}-hint`
        : undefined;
    const [shown, setShown] = useState(false);
    const isPassword = type === 'password';

    return (
      <div className="flex flex-col gap-xs">
        <div className="flex items-baseline justify-between gap-sm">
          <label
            htmlFor={inputId}
            className="text-body-md font-medium text-ink"
          >
            {label}
          </label>
          {aside}
        </div>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={isPassword && shown ? 'text' : type}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              'block min-h-cta w-full rounded-lg border bg-background px-md text-label-md text-ink',
              'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:shadow-focus',
              error ? 'border-app-danger' : 'border-border',
              isPassword && 'pr-12',
              className
            )}
            {...props}
          />
          {isPassword ? (
            <button
              type="button"
              onClick={() => setShown(s => !s)}
              aria-label={shown ? 'Hide password' : 'Show password'}
              aria-pressed={shown}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-muted-foreground active:text-ink"
            >
              {shown ? (
                <EyeOff className="h-4 w-4" aria-hidden />
              ) : (
                <Eye className="h-4 w-4" aria-hidden />
              )}
            </button>
          ) : null}
        </div>
        {error ? (
          <p
            id={`${inputId}-error`}
            className="m-0 text-label-sm text-app-danger"
          >
            {error}
          </p>
        ) : hint ? (
          <p
            id={`${inputId}-hint`}
            className="m-0 text-label-sm text-muted-foreground"
          >
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);
AuthField.displayName = 'AuthField';

/** A form-level error, announced when it appears. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="m-0 rounded-sm bg-app-warning px-md py-sm text-body-md text-ink"
    >
      {message}
    </p>
  );
}
