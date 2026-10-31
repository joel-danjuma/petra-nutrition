import type { ReactNode } from 'react';

import { AuthGuard } from '@/components/auth-guard';

/**
 * Everything under /dashboard needs a session. The chrome lives one level
 * down: `(shell)` for the app's pages, `(focus)` for full-screen cook mode.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
