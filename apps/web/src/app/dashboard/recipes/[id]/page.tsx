'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, Users, Star, Heart, ChefHat, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function RecipeDetailPage({ params }: { params: { id: string } }) {
  const [recipe, setRecipe] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userRating, setUserRating] = useState(0);

  const token = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token
    : null;

  useEffect(() => {
    loadRecipe();
  }, [params.id]);

  const loadRecipe = async () => {
    try {
      const res = await fetch(`${API_URL}/recipes/${params.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setRecipe(data.data);
        setUserRating(data.data.userRating || 0);
      } else {
        toast.error('Recipe not found');
      }
    } catch {
      toast.error('Failed to load recipe');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFavorite = async () => {
    if (!recipe) return;
    const method = recipe.isFavorited ? 'DELETE' : 'POST';
    try {
      await fetch(`${API_URL}/recipes/${recipe.id}/favorite`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      setRecipe((prev: any) => ({ ...prev, isFavorited: !prev.isFavorited }));
      toast.success(recipe.isFavorited ? 'Removed from favorites' : 'Added to favorites');
    } catch {
      toast.error('Failed to update favorite');
    }
  };

  const rateRecipe = async (rating: number) => {
    try {
      await fetch(`${API_URL}/recipes/${recipe.id}/rate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      });
      setUserRating(rating);
      toast.success('Rating saved');
    } catch {
      toast.error('Failed to rate recipe');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="text-center py-24">
        <p className="text-muted-foreground">Recipe not found.</p>
        <Link href="/dashboard/recipes" className="mt-4 inline-block text-primary active:underline">
          Back to Recipes
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/dashboard/recipes"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground active:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Recipes
      </Link>

      {/* Header */}
      <div className="bg-background rounded-2xl border border-border overflow-hidden mb-6">
        <div className="h-64 bg-secondary flex items-center justify-center">
          {recipe.imageUrl ? (
            <img src={recipe.imageUrl} alt={recipe.title} className="w-full h-full object-cover" />
          ) : (
            <ChefHat className="h-20 w-20 text-muted-foreground" />
          )}
        </div>

        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-medium text-foreground">{recipe.title}</h1>
            <button
              onClick={toggleFavorite}
              className={`p-2 rounded-xl transition-colors shrink-0 ${
                recipe.isFavorited
                  ? 'text-destructive bg-secondary active:bg-secondary'
                  : 'text-muted-foreground bg-secondary active:bg-secondary active:text-destructive'
              }`}
            >
              <Heart className={`h-5 w-5 ${recipe.isFavorited ? 'fill-current' : ''}`} />
            </button>
          </div>

          {recipe.description && (
            <p className="text-muted-foreground mt-2">{recipe.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              Prep: {recipe.prepTime}m
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              Cook: {recipe.cookTime}m
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              {recipe.servings} servings
            </span>
            <span className="flex items-center gap-1.5">
              <Star className="h-4 w-4 text-foreground" />
              {recipe.rating?.toFixed(1) || 'No ratings'} ({recipe.reviewCount})
            </span>
          </div>

          {/* User rating */}
          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-1">Your rating:</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => rateRecipe(n)}
                  className={`transition-colors ${n <= userRating ? 'text-foreground' : 'text-muted-foreground active:text-foreground'}`}
                >
                  <Star className="h-5 w-5 fill-current" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Ingredients */}
        <div className="md:col-span-1 bg-background rounded-2xl border border-border p-6">
          <h2 className="font-medium text-foreground mb-4">Ingredients</h2>
          <ul className="space-y-2">
            {recipe.ingredients?.map((ing: any) => (
              <li key={ing.id} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                <span>
                  <span className="font-medium">{ing.amount} {ing.unit}</span> {ing.name}
                  {ing.notes && <span className="text-muted-foreground"> ({ing.notes})</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Instructions */}
        <div className="md:col-span-2 bg-background rounded-2xl border border-border p-6">
          <h2 className="font-medium text-foreground mb-4">Instructions</h2>
          <ol className="space-y-4">
            {recipe.instructions?.map((inst: any) => (
              <li key={inst.id} className="flex gap-4">
                <span className="w-7 h-7 rounded-full bg-secondary text-primary flex items-center justify-center text-sm font-medium shrink-0">
                  {inst.step}
                </span>
                <p className="text-sm text-muted-foreground mt-1">{inst.instruction}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Nutrition */}
      {recipe.nutrition && (
        <div className="mt-6 bg-background rounded-2xl border border-border p-6">
          <h2 className="font-medium text-foreground mb-4">Nutrition (per serving)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Calories', value: recipe.nutrition.calories, unit: 'kcal' },
              { label: 'Protein', value: recipe.nutrition.protein, unit: 'g' },
              { label: 'Carbs', value: recipe.nutrition.carbs, unit: 'g' },
              { label: 'Fat', value: recipe.nutrition.fat, unit: 'g' },
            ].map(n => (
              <div key={n.label} className="text-center p-3 rounded-xl bg-secondary">
                <p className="text-lg font-medium text-foreground">
                  {Math.round(n.value / (recipe.servings || 1))}{n.unit}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{n.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
