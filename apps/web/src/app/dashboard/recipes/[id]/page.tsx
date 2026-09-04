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
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="text-center py-24">
        <p className="text-gray-500">Recipe not found.</p>
        <Link href="/dashboard/recipes" className="mt-4 inline-block text-green-600 hover:underline">
          Back to Recipes
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/dashboard/recipes"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Recipes
      </Link>

      {/* Header */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden mb-6">
        <div className="h-64 bg-gradient-to-br from-green-100 to-blue-100 dark:from-green-900/30 dark:to-blue-900/30 flex items-center justify-center">
          {recipe.imageUrl ? (
            <img src={recipe.imageUrl} alt={recipe.title} className="w-full h-full object-cover" />
          ) : (
            <ChefHat className="h-20 w-20 text-gray-400" />
          )}
        </div>

        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{recipe.title}</h1>
            <button
              onClick={toggleFavorite}
              className={`p-2 rounded-xl transition-colors shrink-0 ${
                recipe.isFavorited
                  ? 'text-red-500 bg-red-50 dark:bg-red-900/20 hover:bg-red-100'
                  : 'text-gray-400 bg-gray-50 dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-400'
              }`}
            >
              <Heart className={`h-5 w-5 ${recipe.isFavorited ? 'fill-current' : ''}`} />
            </button>
          </div>

          {recipe.description && (
            <p className="text-gray-600 dark:text-gray-400 mt-2">{recipe.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-gray-600 dark:text-gray-400">
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
              <Star className="h-4 w-4 text-amber-400" />
              {recipe.rating?.toFixed(1) || 'No ratings'} ({recipe.reviewCount})
            </span>
          </div>

          {/* User rating */}
          <div className="mt-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Your rating:</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => rateRecipe(n)}
                  className={`transition-colors ${n <= userRating ? 'text-amber-400' : 'text-gray-300 dark:text-gray-600 hover:text-amber-300'}`}
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
        <div className="md:col-span-1 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Ingredients</h2>
          <ul className="space-y-2">
            {recipe.ingredients?.map((ing: any) => (
              <li key={ing.id} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 shrink-0" />
                <span>
                  <span className="font-medium">{ing.amount} {ing.unit}</span> {ing.name}
                  {ing.notes && <span className="text-gray-400 dark:text-gray-500"> ({ing.notes})</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Instructions */}
        <div className="md:col-span-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Instructions</h2>
          <ol className="space-y-4">
            {recipe.instructions?.map((inst: any) => (
              <li key={inst.id} className="flex gap-4">
                <span className="w-7 h-7 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 flex items-center justify-center text-sm font-semibold shrink-0">
                  {inst.step}
                </span>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{inst.instruction}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Nutrition */}
      {recipe.nutrition && (
        <div className="mt-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Nutrition (per serving)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Calories', value: recipe.nutrition.calories, unit: 'kcal' },
              { label: 'Protein', value: recipe.nutrition.protein, unit: 'g' },
              { label: 'Carbs', value: recipe.nutrition.carbs, unit: 'g' },
              { label: 'Fat', value: recipe.nutrition.fat, unit: 'g' },
            ].map(n => (
              <div key={n.label} className="text-center p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {Math.round(n.value / (recipe.servings || 1))}{n.unit}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{n.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
