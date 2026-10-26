'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { errorMessage, useAuth } from '@petra/shared';

import { AuthField, FormError } from '@/components/auth/field';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const router = useRouter();

  const onChange = (e: ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await login(form);
      router.push('/dashboard');
    } catch (err) {
      setError(
        errorMessage(
          err,
          'That email and password do not match. Check them and try again.'
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <h1 className="m-0 text-section text-ink">Welcome back.</h1>
      <p className="m-0 mt-sm text-body-lg text-body">
        Your pantry is where you left it.
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
          value={form.email}
          onChange={onChange}
        />
        <AuthField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={form.password}
          onChange={onChange}
          aside={
            <Link
              href="/auth/forgot-password"
              className="rounded-sm text-body-md text-muted-foreground active:text-ink"
            >
              Forgot it?
            </Link>
          }
        />
        <Button
          type="submit"
          size="lg"
          fullWidth
          disabled={isLoading}
          className="mt-1.5"
        >
          {isLoading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="m-0 mt-7 text-body-md text-muted-foreground">
        New to Petra?{' '}
        <Link
          href="/auth/register"
          className="font-medium text-ink underline underline-offset-2"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
