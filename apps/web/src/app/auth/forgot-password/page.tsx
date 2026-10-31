'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { errorMessage, useApi } from '@petra/shared';

import { AuthField, FormError } from '@/components/auth/field';
import { Button } from '@/components/ui/button';

export default function ForgotPasswordPage() {
  const api = useApi();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await api.auth.requestPasswordReset({ email });
      setSent(true);
    } catch (err) {
      setError(
        errorMessage(
          err,
          'The reset link could not be sent. Try again in a minute.'
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <h1 className="m-0 text-section text-ink">
        {sent ? 'Check your inbox.' : 'Reset your password.'}
      </h1>

      {sent ? (
        <p className="m-0 mt-sm text-body-lg text-body" role="status">
          If an account uses <span className="text-ink">{email}</span>, a reset
          link is on its way. It works once, so use the newest one if you ask
          twice.
        </p>
      ) : (
        <>
          <p className="m-0 mt-sm text-body-lg text-body">
            Enter the email you signed up with and Petra will send a link to
            choose a new one.
          </p>
          <form onSubmit={onSubmit} className="mt-xl flex flex-col gap-[18px]">
            <FormError message={error} />
            <AuthField
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <Button
              type="submit"
              size="lg"
              fullWidth
              disabled={isLoading}
              className="mt-1.5"
            >
              {isLoading ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
        </>
      )}

      <Link
        href="/auth/login"
        className="mt-7 inline-flex items-center gap-xs rounded-sm text-body-md text-muted-foreground active:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to sign in
      </Link>
    </>
  );
}
