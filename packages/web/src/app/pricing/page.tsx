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
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <ChefHat className="h-6 w-6 text-green-600" />
            <span className="text-lg font-bold text-gray-900 dark:text-white">Petra AI</span>
          </Link>
          <div className="flex gap-4">
            <Link href="/auth/login" className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">Sign In</Link>
            <Link href="/auth/register" className="text-sm px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">Get Started</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-14">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Simple, transparent pricing</h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">Start for free. Upgrade when you need more power.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Free */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Free</h2>
            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-4xl font-bold text-gray-900 dark:text-white">$0</span>
              <span className="text-gray-500">/month</span>
            </div>
            <ul className="space-y-3 mb-8">
              {FREE_FEATURES.map(f => (
                <li key={f} className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                  <Check className="h-4 w-4 text-green-500 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/auth/register" className="block w-full text-center px-6 py-3 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Get started free
            </Link>
          </div>

          {/* Premium */}
          <div className="bg-gradient-to-br from-green-600 to-blue-600 rounded-2xl p-8 text-white relative overflow-hidden">
            <div className="absolute top-4 right-4 px-3 py-1 bg-white/20 rounded-full text-xs font-medium">
              Most Popular
            </div>
            <h2 className="text-xl font-bold mb-1">Premium</h2>
            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-4xl font-bold">$9</span>
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
            <Link href="/auth/register" className="block w-full text-center px-6 py-3 bg-white text-green-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors">
              Start with Premium
            </Link>
          </div>
        </div>

        <div className="text-center mt-12 text-sm text-gray-500 dark:text-gray-400">
          All prices in USD. Cancel anytime.{' '}
          <Link href="/about" className="text-green-600 hover:underline">Questions? Contact us.</Link>
        </div>
      </div>
    </main>
  );
}
