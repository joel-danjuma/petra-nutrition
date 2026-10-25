'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@petra/shared';

import { AuthField, FormError } from '@/components/auth/field';
import { Segmented } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/utils';

type Household = '1' | '2' | '3-4' | '5+';

const HOUSEHOLD_OPTIONS = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3-4', label: '3–4' },
  { value: '5+', label: '5+' },
] as const;

/**
 * Stored as a single number. Ranges round up: quantities scale from this, and
 * a recipe that runs a portion over beats one that leaves someone without.
 */
const HOUSEHOLD_SIZE: Record<Household, number> = {
  '1': 1,
  '2': 2,
  '3-4': 4,
  '5+': 5,
};

export default function RegisterPage() {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });
  const [household, setHousehold] = useState<Household>('2');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { register, updateProfile } = useAuth();
  const router = useRouter();

  const onChange = (e: ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      // Everyone starts on Free.
      await register({ ...form, subscriptionTier: 'FREE' });
    } catch (err) {
      setError(
        errorMessage(
          err,
          'The account could not be created. Check the details and try again.'
        )
      );
      setIsLoading(false);
      return;
    }

    // The account exists at this point. Household size is a nicety — if saving
    // it fails, carry on rather than stranding someone on the sign-up form.
    try {
      await updateProfile({
        profile: {
          dietaryRestrictions: [],
          allergies: [],
          healthGoals: [],
          cuisinePreferences: [],
          householdSize: HOUSEHOLD_SIZE[household],
        },
      });
    } catch {
      // Editable later from Profile.
    }
    router.push('/dashboard');
  };

  return (
    <>
      <h1 className="m-0 text-section text-ink">Set up your pantry.</h1>
      <p className="m-0 mt-sm text-body-lg text-body">
        Free for one day at a time. No card needed.
      </p>

      <form onSubmit={onSubmit} className="mt-xl flex flex-col gap-[18px]">
        <FormError message={error} />
        <div className="grid grid-cols-1 gap-[18px] min-[400px]:grid-cols-2">
          <AuthField
            label="First name"
            name="firstName"
            autoComplete="given-name"
            required
            value={form.firstName}
            onChange={onChange}
          />
          <AuthField
            label="Last name"
            name="lastName"
            autoComplete="family-name"
            required
            value={form.lastName}
            onChange={onChange}
          />
        </div>
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
          autoComplete="new-password"
          required
          minLength={8}
          hint="At least 8 characters."
          value={form.password}
          onChange={onChange}
        />
        <div className="flex flex-col gap-2.5">
          <span
            id="household-label"
            className="text-body-md font-medium text-ink"
          >
            Cooking for
          </span>
          <Segmented
            label="Cooking for"
            options={HOUSEHOLD_OPTIONS}
            value={household}
            onChange={setHousehold}
          />
        </div>
        <Button
          type="submit"
          size="lg"
          fullWidth
          disabled={isLoading}
          className="mt-1.5"
        >
          {isLoading ? 'Creating your account…' : 'Create account'}
        </Button>
      </form>

      <p className="m-0 mt-5 text-label-sm leading-normal text-muted-foreground">
        By creating an account you agree to the{' '}
        <Link href="/terms" className="underline underline-offset-2">
          terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="underline underline-offset-2">
          privacy policy
        </Link>
        .
      </p>
      <p className="m-0 mt-5 text-body-md text-muted-foreground">
        Already cooking with Petra?{' '}
        <Link
          href="/auth/login"
          className="font-medium text-ink underline underline-offset-2"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
