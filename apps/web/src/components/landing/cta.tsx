'use client';

import { useRouter } from 'next/navigation';

import { CtaBandLight } from '@/components/ds';

/**
 * The closing CTA.
 *
 * The light-gray banner is the system's documented final band before the
 * footer — it follows the pricing surface without repeating it, and carries the
 * near-black primary CTA.
 */
export function CTA() {
  const router = useRouter();

  return (
    <section className="band mx-auto max-w-[1280px] px-lg">
      <CtaBandLight
        title="Start cooking what you already have."
        body="Free to start. Tell Petra what is in the kitchen and it will build tonight's dinner around it."
        primaryLabel="Get started for free"
        secondaryLabel="See how it works"
        onPrimary={() => router.push('/auth/register')}
        onSecondary={() => router.push('/features')}
      />
    </section>
  );
}
