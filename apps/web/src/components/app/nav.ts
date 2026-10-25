import {
  BookOpen,
  Calendar,
  MessageSquare,
  Package,
  ShoppingBasket,
  Sun,
  type LucideIcon,
} from 'lucide-react';

export interface AppNavItem {
  href: string;
  /** Side-rail label. */
  label: string;
  /** Tab-bar label — shorter, it shares 1/5 of a phone's width. */
  short: string;
  icon: LucideIcon;
  /** Only the exact path counts as active (Today, whose path prefixes the rest). */
  exact?: boolean;
  /** Shown in the bottom tab bar as well as the rail. */
  inTabBar: boolean;
}

/**
 * The app's navigation, read by both the side rail (≥900px) and the bottom
 * tab bar (<900px) so the two cannot drift. Recipes stays rail-only: five
 * tabs is the most a phone row holds at a 44px+ target each.
 */
export const APP_NAV: readonly AppNavItem[] = [
  {
    href: '/dashboard',
    label: 'Today',
    short: 'Today',
    icon: Sun,
    exact: true,
    inTabBar: true,
  },
  {
    href: '/dashboard/chat',
    label: 'Ask Petra',
    short: 'Ask',
    icon: MessageSquare,
    inTabBar: true,
  },
  {
    href: '/dashboard/pantry',
    label: 'Pantry',
    short: 'Pantry',
    icon: Package,
    inTabBar: true,
  },
  {
    href: '/dashboard/meal-plans',
    label: 'Week',
    short: 'Week',
    icon: Calendar,
    inTabBar: true,
  },
  {
    href: '/dashboard/shopping-lists',
    label: 'Shopping',
    short: 'Shop',
    icon: ShoppingBasket,
    inTabBar: true,
  },
  {
    href: '/dashboard/recipes',
    label: 'Recipes',
    short: 'Recipes',
    icon: BookOpen,
    inTabBar: false,
  },
];

export const isNavActive = (item: AppNavItem, pathname: string) =>
  item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
