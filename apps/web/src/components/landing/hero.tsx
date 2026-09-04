'use client';

import { useRouter } from 'next/navigation';

import { HeroBand, LogoStrip } from '@/components/ds';

/**
 * The homepage opening band.
 *
 * Pure white canvas with no backdrop of any kind — the design system's calm is
 * the brand atmosphere, and a hero gradient is explicitly forbidden. Emphasis
 * comes from the 40px display size at weight 400, not from bold or colour.
 */
export function Hero() {
  const router = useRouter();

  return (
    <>
      <HeroBand
        eyebrow="Petra Nutrition"
        title="Cook with what you already have."
        subtitle="Petra reads your pantry, invents the dish, walks you through it hands-free, and makes sure nothing gets binned."
        primaryLabel="Get started for free"
        secondaryLabel="See how it works"
        onPrimary={() => router.push('/auth/register')}
        onSecondary={() => router.push('/features')}
      />

      <div className="mx-auto max-w-[1280px] px-lg pb-section">
        <LogoStrip
          label="Trusted by"
          logos={[
            'Verdant Market',
            'Northfield Grocers',
            'Bright Table Media',
            'Form Weekly',
            'Cedarline Wellness',
          ]}
        />
      </div>
    </>
  );
}
