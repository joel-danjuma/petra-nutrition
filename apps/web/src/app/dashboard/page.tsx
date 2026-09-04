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
    color: 'bg-signature-forest',
    free: true,
  },
  {
    title: 'Recipes',
    description: 'Discover, search, and generate custom recipes',
    icon: BookOpen,
    href: '/dashboard/recipes',
    color: 'bg-signature-dark',
    free: true,
  },
  {
    title: 'Pantry',
    description: 'Track your inventory with barcode and image scanning',
    icon: Package,
    href: '/dashboard/pantry',
    color: 'bg-signature-coral',
    free: false,
  },
  {
    title: 'Meal Plans',
    description: 'AI-powered weekly meal planning tailored to you',
    icon: Calendar,
    href: '/dashboard/meal-plans',
    color: 'bg-signature-dark',
    free: false,
  },
  {
    title: 'Shopping Lists',
    description: 'Auto-generate lists from your meal plans',
    icon: ShoppingCart,
    href: '/dashboard/shopping-lists',
    color: 'bg-signature-coral',
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
        <h1 className="text-2xl font-medium text-foreground">
          Welcome back, {user?.firstName}!
        </h1>
        <p className="text-muted-foreground mt-1">
          What would you like to cook today?
        </p>
      </div>

      {/* Premium upgrade banner */}
      {!isPremium && (
        <div className="mb-6 p-4 rounded-xl bg-warning border border-border flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Crown className="h-5 w-5 text-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium text-warning-foreground">
                Unlock all features with Premium
              </p>
              <p className="text-xs text-foreground">
                Pantry management, multi-day meal plans, shopping lists, and more
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/profile#subscription"
            className="shrink-0 text-xs font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground active:bg-[var(--color-primary-active)] transition-colors"
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
                  ? 'border-border opacity-75'
                  : 'border-border active:border-border '
              } bg-background`}
            >
              <div className={`w-12 h-12 rounded-md ${feature.color} flex items-center justify-center mb-4`}>
                <Icon className="h-6 w-6 text-white" />
              </div>
              <h2 className="text-base font-medium text-foreground flex items-center gap-2">
                {feature.title}
                {locked && (
                  <Crown className="h-3.5 w-3.5 text-foreground" />
                )}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">{feature.description}</p>
              {!locked && (
                <ArrowRight className="h-4 w-4 text-muted-foreground group-active group-active:translate-x-1 transition-all mt-4" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
