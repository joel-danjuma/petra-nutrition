'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@petra/shared';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

/**
 * Lets signed-in users through and sends everyone else to sign in.
 *
 * It waits for `hasHydrated` before deciding. The auth store reads the saved
 * session asynchronously (`skipHydration` + `configureAuthStorage`), so until
 * that read finishes `isAuthenticated` is false for everyone — deciding then
 * bounced every signed-in user to the login screen on a hard refresh.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, hasHydrated } = useAuth();
  const router = useRouter();
  const ready = hasHydrated && !isLoading;

  useEffect(() => {
    if (ready && !isAuthenticated) {
      router.replace('/auth/login');
    }
  }, [isAuthenticated, ready, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
