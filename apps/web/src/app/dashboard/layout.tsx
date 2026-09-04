'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@petra/shared';
import { AuthGuard } from '@/components/auth-guard';
import {
  ChefHat,
  MessageSquare,
  BookOpen,
  ShoppingCart,
  Calendar,
  Package,
  User,
  LogOut,
  Menu,
  X,
  Crown,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: ChefHat, exact: true },
  { href: '/dashboard/chat', label: 'AI Chat', icon: MessageSquare },
  { href: '/dashboard/recipes', label: 'Recipes', icon: BookOpen },
  { href: '/dashboard/pantry', label: 'Pantry', icon: Package },
  { href: '/dashboard/meal-plans', label: 'Meal Plans', icon: Calendar },
  { href: '/dashboard/shopping-lists', label: 'Shopping Lists', icon: ShoppingCart },
  { href: '/dashboard/profile', label: 'Profile', icon: User },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const isActive = (item: typeof navItems[0]) => {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-secondary flex">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-30 w-64 bg-background border-r border-border flex flex-col transform transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Logo */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
            <ChefHat className="h-7 w-7 text-primary" />
            <span className="text-xl font-medium text-foreground">
              Petra AI
            </span>
          </div>

          {/* User badge */}
          <div className="px-4 py-3 mx-3 my-3 rounded-lg bg-secondary">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-sm font-medium">
                {user?.firstName?.[0]?.toUpperCase() ?? 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {user?.firstName} {user?.lastName}
                </p>
                <div className="flex items-center gap-1">
                  {(user as any)?.subscriptionTier === 'PREMIUM' ? (
                    <>
                      <Crown className="h-3 w-3 text-foreground" />
                      <span className="text-xs text-foreground">Premium</span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Free</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-secondary text-primary'
                      : 'text-muted-foreground active:bg-secondary active:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Logout */}
          <div className="px-3 py-4 border-t border-border">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground active:bg-secondary active:text-destructive transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile header */}
          <header className="lg:hidden flex items-center gap-4 px-4 py-3 bg-background border-b border-border">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-muted-foreground active:bg-secondary"
            >
              <Menu className="h-5 w-5" />
            </button>
            <ChefHat className="h-6 w-6 text-primary" />
            <span className="text-lg font-medium text-foreground">Petra AI</span>
          </header>

          {/* Page content */}
          <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
