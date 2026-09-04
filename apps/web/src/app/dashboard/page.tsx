'use client';

import Link from 'next/link';
import { useAuth } from '@petra/shared';
import { MessageSquare, BookOpen, Package, Calendar, ShoppingCart, ArrowRight, Crown } from 'lucide-react';

const features = [
  {
    title: 'AI Chat',
    description: 'Get personalized recipe suggestions and cooking advice',
    icon: MessageSquare,
    href: '/dashboard/chat',
    color: 'from-green-400 to-emerald-600',
    free: true,
  },
  {
    title: 'Recipes',
    description: 'Discover, search, and generate custom recipes',
    icon: BookOpen,
    href: '/dashboard/recipes',
    color: 'from-blue-400 to-indigo-600',
    free: true,
  },
  {
    title: 'Pantry',
    description: 'Track your inventory with barcode and image scanning',
    icon: Package,
    href: '/dashboard/pantry',
    color: 'from-amber-400 to-orange-600',
    free: false,
  },
  {
    title: 'Meal Plans',
    description: 'AI-powered weekly meal planning tailored to you',
    icon: Calendar,
    href: '/dashboard/meal-plans',
    color: 'from-purple-400 to-violet-600',
    free: false,
  },
  {
    title: 'Shopping Lists',
    description: 'Auto-generate lists from your meal plans',
    icon: ShoppingCart,
    href: '/dashboard/shopping-lists',
    color: 'from-rose-400 to-pink-600',
    free: false,
  },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const isPremium = (user as any)?.subscriptionTier === 'PREMIUM';

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Welcome back, {user?.firstName}!
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          What would you like to cook today?
        </p>
      </div>

      {/* Premium upgrade banner */}
      {!isPremium && (
        <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Crown className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">
                Unlock all features with Premium
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Pantry management, multi-day meal plans, shopping lists, and more
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/profile#subscription"
            className="shrink-0 text-xs font-semibold px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
          >
            Upgrade
          </Link>
        </div>
      )}

      {/* Feature grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map(feature => {
          const Icon = feature.icon;
          const locked = !feature.free && !isPremium;

          return (
            <Link
              key={feature.href}
              href={locked ? '/dashboard/profile#subscription' : feature.href}
              className={`group relative p-6 rounded-2xl border transition-all ${
                locked
                  ? 'border-gray-200 dark:border-gray-800 opacity-75'
                  : 'border-gray-200 dark:border-gray-800 hover:border-green-300 dark:hover:border-green-700 hover:shadow-md'
              } bg-white dark:bg-gray-900`}
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4`}>
                <Icon className="h-6 w-6 text-white" />
              </div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                {feature.title}
                {locked && (
                  <Crown className="h-3.5 w-3.5 text-amber-500" />
                )}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{feature.description}</p>
              {!locked && (
                <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-green-600 group-hover:translate-x-1 transition-all mt-4" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
