import type { ItemCategory, MealType, StorageLocation } from '@petra/shared';

/**
 * Response shapes as the API actually sends them (Prisma rows serialised to
 * JSON), for the endpoints the redesigned screens read.
 *
 * These exist because some shared types describe a different shape: the
 * shared `MealPlan` has nested `days[]`, while `GET /meal-plans` returns a flat
 * `meals[]`, and dates arrive as ISO strings rather than `Date`s. Rather than
 * cast every response to `any`, the screens type against what is on the wire.
 */

export interface RecipeSummaryWire {
  id: string;
  title: string;
  imageUrl: string | null;
  prepTime: number | null;
  cookTime: number | null;
  totalTime: number | null;
  servings: number;
  dietaryTags?: string[];
  nutrition?: { calories: number; protein: number } | null;
}

export interface MealWire {
  id: string;
  /** ISO date, midnight UTC (Prisma `@db.Date`). */
  date: string;
  mealType: MealType;
  recipeId: string | null;
  recipe: RecipeSummaryWire | null;
  customName: string | null;
  servings: number;
  notes: string | null;
  /** "Leftovers", "Batch", "Uses 3 expiring" … */
  tag: string | null;
}

export interface MealPlanWire {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  meals: MealWire[];
}

export interface MealPlanListWire {
  mealPlans: MealPlanWire[];
  total: number;
  hasMore: boolean;
}

export interface PantryItemWire {
  id: string;
  name: string;
  category: ItemCategory;
  quantity: number;
  unit: string;
  location: StorageLocation;
  expirationDate: string | null;
  brand: string | null;
  isLowStock: boolean;
}

export interface PantryListWire {
  items: PantryItemWire[];
  total: number;
  hasMore?: boolean;
}

/** A meal's display name: the recipe title, or the planner's free text. */
export const mealName = (m: MealWire) =>
  m.recipe?.title ?? m.customName ?? 'Something simple';

/** `YYYY-MM-DD` for a local date, matching the API's `@db.Date` serialisation. */
export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The `YYYY-MM-DD` part of an API date string. */
export const dayOf = (iso: string) => iso.slice(0, 10);

export interface ShoppingItemWire {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: ItemCategory;
  isCompleted: boolean;
  recipeId: string | null;
  recipeName: string | null;
  notes: string | null;
}

/** An ingredient the generator left off because the pantry covered it. */
export interface SkippedItemWire {
  name: string;
  /** What the pantry holds: "3 tins". */
  have: string;
  location: StorageLocation;
}

export interface ShoppingListWire {
  id: string;
  name: string;
  description: string | null;
  mealPlanId: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string;
  items: ShoppingItemWire[];
  skippedItems: SkippedItemWire[] | null;
}

export interface ShoppingListListWire {
  shoppingLists: ShoppingListWire[];
  total: number;
  hasMore?: boolean;
}

export interface IngredientWire {
  id: string;
  name: string;
  amount: number;
  unit: string;
  notes: string | null;
  order: number;
}

export interface InstructionWire {
  id: string;
  step: number;
  instruction: string;
  /** Minutes, when the step has a timer. */
  duration: number | null;
  tip: string | null;
}

/** `GET /recipes/:id` — with `pantryMatch` when signed in. */
export interface RecipeWire extends RecipeSummaryWire {
  description: string | null;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  cuisine: string | null;
  ingredients: IngredientWire[];
  instructions: InstructionWire[];
  nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number | null;
  } | null;
  safetyNote: string | null;
  zeroWasteNote: string | null;
  isFavorited?: boolean;
  userRating?: number | null;
  pantryMatch?: {
    ingredients: Array<{
      ingredientId: string;
      status: 'have' | 'use-soon' | 'missing';
      daysLeft: number | null;
      have?: string;
    }>;
    toBuy: number;
    clears: number;
  };
}

/** "150 g", "2 tbsp", "4" — an ingredient's amount as a cook would say it. */
export const amountOf = (i: Pick<IngredientWire, 'amount' | 'unit'>) => {
  const n = Number.isInteger(i.amount)
    ? i.amount
    : Math.round(i.amount * 100) / 100;
  if (!i.unit || i.unit === 'pcs' || i.unit === 'piece' || i.unit === 'pieces')
    return String(n);
  return `${n} ${i.unit}`;
};
