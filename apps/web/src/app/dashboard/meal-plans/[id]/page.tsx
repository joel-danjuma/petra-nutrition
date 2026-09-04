'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, Loader2, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

export default function MealPlanDetailPage({ params }: { params: { id: string } }) {
  const [plan, setPlan] = useState<any>(null);
  const [nutrition, setNutrition] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const token = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token
    : null;

  useEffect(() => { loadPlan(); }, [params.id]);

  const loadPlan = async () => {
    try {
      const [planRes, nutritionRes] = await Promise.all([
        fetch(`${API_URL}/meal-plans/${params.id}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/meal-plans/${params.id}/nutrition`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const planData = await planRes.json();
      const nutritionData = await nutritionRes.json();
      if (planData.success) setPlan(planData.data);
      if (nutritionData.success) setNutrition(nutritionData.data);
    } catch {
      toast.error('Failed to load meal plan');
    } finally {
      setIsLoading(false);
    }
  };

  const generateShoppingList = async () => {
    try {
      const res = await fetch(`${API_URL}/shopping-lists/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealPlanId: params.id }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Shopping list created!');
        router.push(`/dashboard/shopping-lists/${data.data.id}`);
      }
    } catch {
      toast.error('Failed to generate shopping list');
    }
  };

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!plan) return <div className="text-center py-24 text-muted-foreground">Meal plan not found.</div>;

  // Group meals by date
  const mealsByDate: Record<string, any[]> = {};
  for (const meal of plan.meals || []) {
    const date = meal.date.split('T')[0];
    if (!mealsByDate[date]) mealsByDate[date] = [];
    mealsByDate[date].push(meal);
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/meal-plans" className="p-2 text-muted-foreground active:text-foreground rounded-lg active:bg-secondary transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-medium text-foreground truncate">{plan.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date(plan.startDate).toLocaleDateString()} – {new Date(plan.endDate).toLocaleDateString()}
          </p>
        </div>
        <Button onClick={generateShoppingList} size="sm" variant="outline" className="gap-2 shrink-0">
          <ShoppingCart className="h-4 w-4" />
          Shopping List
        </Button>
      </div>

      {/* Nutrition summary */}
      {nutrition?.averages && (
        <div className="bg-background rounded-2xl border border-border p-5 mb-6">
          <h2 className="font-medium text-foreground mb-3 text-sm">Daily Nutrition Averages</h2>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Calories', value: nutrition.averages.calories, unit: 'kcal' },
              { label: 'Protein', value: nutrition.averages.protein, unit: 'g' },
              { label: 'Carbs', value: nutrition.averages.carbs, unit: 'g' },
              { label: 'Fat', value: nutrition.averages.fat, unit: 'g' },
            ].map(n => (
              <div key={n.label} className="text-center p-3 bg-secondary rounded-xl">
                <p className="text-base font-medium text-foreground">{n.value}{n.unit}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{n.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meals by day */}
      <div className="space-y-4">
        {Object.entries(mealsByDate).map(([date, meals]) => (
          <div key={date} className="bg-background rounded-2xl border border-border p-5">
            <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
            <div className="space-y-2">
              {MEAL_TYPES.map(type => {
                const meal = meals.find((m: any) => m.mealType === type);
                return (
                  <div key={type} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                    <span className="text-xs font-medium text-muted-foreground w-20 shrink-0">
                      {type.charAt(0) + type.slice(1).toLowerCase()}
                    </span>
                    {meal ? (
                      <span className="text-sm text-foreground">
                        {meal.recipe?.title || meal.customName || '—'}
                        {meal.servings > 1 && <span className="text-muted-foreground ml-1">×{meal.servings}</span>}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground italic">Not planned</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {Object.keys(mealsByDate).length === 0 && (
          <div className="text-center py-12 text-muted-foreground">No meals added to this plan yet.</div>
        )}
      </div>
    </div>
  );
}
