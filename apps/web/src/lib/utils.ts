import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge only knows Tailwind's stock font sizes, so it reads the
 * design system's (`text-label-md`, `text-eyebrow`, …) as text *colours* and
 * drops whichever comes first: `cn('text-label-md', 'text-foreground')` used to
 * return just `text-foreground`. These must match `fontSize` in
 * tailwind.config.js.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-family': [{ font: ['pricing'] }],
      'font-weight': [{ font: ['regular', 'legal', 'mid', 'mid-strong'] }],
      'font-size': [
        {
          text: [
            'display-xl',
            'display-lg',
            'display-md',
            'title-lg',
            'title-md',
            'title-sm',
            'label-md',
            'body-md',
            'caption',
            'legal',
            'lead',
            'body-lg',
            'label-sm',
            'eyebrow',
            'micro',
            'hero',
            'display',
            'section',
            'card-title',
            'lede',
            'cook',
            'cook-num',
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export function generateAvatarFallback(name: string): string {
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase())
    .join('')
    .substring(0, 2);
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function debounce<A extends unknown[]>(
  func: (...args: A) => unknown,
  wait: number
): (...args: A) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: A) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * A readable message from anything an API call can reject with.
 *
 * The shared ApiClient rejects with a plain `{ code, message }` object, not an
 * `Error`, so `err instanceof Error` misses every API failure — and a sign-in
 * form that falls back to "wrong password" then says so even when the server
 * is simply not running.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const e = err as { code?: unknown; message?: unknown };
    if (e.code === 'NETWORK_ERROR' || e.code === 'TIMEOUT_ERROR') {
      return 'Petra cannot be reached right now. Check your connection and try again.';
    }
    if (typeof e.message === 'string' && e.message.trim()) return e.message;
  }
  return fallback;
}
