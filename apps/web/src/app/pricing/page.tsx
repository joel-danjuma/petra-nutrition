import Link from 'next/link';
import { ChefHat, Check, X } from 'lucide-react';

const FREE_FEATURES = [
  'AI chat assistant',
  'Recipe search & discovery',
  'Single-day meal planning',
  'Recipe generation with AI',
  'User profile & preferences',
];

const PREMIUM_FEATURES = [
  'Everything in Free',
  'Pantry inventory management',
  'Barcode & image scanning',
  'Multi-day AI meal planning (up to 14 days)',
  'Smart shopping lists',
  'Cross-reference pantry when generating lists',
  'Shopping list export (CSV)',
  'Meal plan templates',
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-secondary">
      <nav className="bg-background border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <ChefHat className="h-6 w-6 text-primary" />
            <span className="text-lg font-medium text-foreground">Petra AI</span>
          </Link>
          <div className="flex gap-4">
            <Link href="/auth/login" className="text-sm text-muted-foreground active:text-foreground">Sign In</Link>
            <Link href="/auth/register" className="text-sm px-4 py-1.5 bg-primary text-white rounded-lg active:bg-primary transition-colors">Get Started</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-14">
          <h1 className="text-4xl font-medium text-foreground mb-4">Simple, transparent pricing</h1>
          <p className="text-lg text-muted-foreground">Start for free. Upgrade when you need more power.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Free */}
          <div className="bg-background rounded-2xl border border-border p-8">
            <h2 className="text-xl font-medium text-foreground mb-1">Free</h2>
            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-4xl font-medium text-foreground">$0</span>
              <span className="text-muted-foreground">/month</span>
            </div>
            <ul className="space-y-3 mb-8">
              {FREE_FEATURES.map(f => (
                <li key={f} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/auth/register" className="block w-full text-center px-6 py-3 border border-border text-foreground rounded-xl font-medium active:bg-secondary transition-colors">
              Get started free
            </Link>
          </div>

          {/* Premium */}
          <div className="bg-secondary rounded-2xl p-8 text-white relative overflow-hidden">
            <div className="absolute top-4 right-4 px-3 py-1 bg-background/20 rounded-full text-xs font-medium">
              Most Popular
            </div>
            <h2 className="text-xl font-medium mb-1">Premium</h2>
            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-4xl font-medium">$9</span>
              <span className="text-white/70">/month</span>
            </div>
            <ul className="space-y-3 mb-8">
              {PREMIUM_FEATURES.map(f => (
                <li key={f} className="flex items-center gap-3 text-sm text-white">
                  <Check className="h-4 w-4 text-white/80 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/auth/register" className="block w-full text-center px-6 py-3 bg-background text-primary rounded-xl font-medium active:bg-secondary transition-colors">
              Start with Premium
            </Link>
          </div>
        </div>

        <div className="text-center mt-12 text-sm text-muted-foreground">
          All prices in USD. Cancel anytime.{' '}
          <Link href="/about" className="text-primary active:underline">Questions? Contact us.</Link>
        </div>
      </div>
    </main>
  );
}
