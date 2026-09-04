import { Suspense } from 'react';
import { Hero } from '@/components/landing/hero';
import { Features } from '@/components/landing/features';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Testimonials } from '@/components/landing/testimonials';
import { Pricing } from '@/components/landing/pricing';
import { CTA } from '@/components/landing/cta';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main>
        <Suspense fallback={<LoadingSpinner />}>
          <Hero />
          <Features />
          <HowItWorks />
          <Testimonials />
          <Pricing />
          <CTA />
        </Suspense>
      </main>
      
      <Footer />
    </div>
  );
}
