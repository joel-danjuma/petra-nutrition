'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, Clock, Star, Sparkles, ChefHat, Loader2, Heart, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface Recipe {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  prepTime: number;
  cookTime: number;
  difficulty: string;
  cuisine: string | null;
  rating: number | null;
  reviewCount: number;
  dietaryTags: string[];
  isAIGenerated: boolean;
  isFavorited?: boolean;
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedRecipe, setGeneratedRecipe] = useState<string | null>(null);

  const token = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token
    : null;

  useEffect(() => {
    loadRecipes();
  }, [query, difficulty]);

  const loadRecipes = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (difficulty) params.set('difficulty', difficulty);
      params.set('limit', '24');

      const res = await fetch(`${API_URL}/recipes/search?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setRecipes(data.data.recipes || []);
      }
    } catch {
      toast.error('Failed to load recipes');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFavorite = async (recipe: Recipe) => {
    try {
      const method = recipe.isFavorited ? 'DELETE' : 'POST';
      await fetch(`${API_URL}/recipes/${recipe.id}/favorite`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      setRecipes(prev =>
        prev.map(r => r.id === recipe.id ? { ...r, isFavorited: !r.isFavorited } : r)
      );
    } catch {
      toast.error('Failed to update favorite');
    }
  };

  const generateRecipe = async () => {
    if (!generatePrompt.trim()) return;
    setIsGenerating(true);
    try {
      const res = await fetch(`${API_URL}/recipes/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: generatePrompt }),
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedRecipe(data.data.content || JSON.stringify(data.data.structuredData, null, 2));
      } else {
        throw new Error(data.error?.message);
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate recipe');
    } finally {
      setIsGenerating(false);
    }
  };

  const difficultyColor = (d: string) => {
    if (d === 'EASY') return 'text-primary bg-secondary';
    if (d === 'MEDIUM') return 'text-foreground bg-warning';
    return 'text-destructive bg-secondary';
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-medium text-foreground">Recipes</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Discover, search, and generate custom recipes
          </p>
        </div>
        <Button onClick={() => setShowGenerateModal(true)} className="gap-2">
          <Sparkles className="h-4 w-4" />
          Generate with AI
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search recipes..."
            className="w-full pl-10 pr-4 py-2.5 border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent text-sm"
          />
        </div>
        <select
          value={difficulty}
          onChange={e => setDifficulty(e.target.value)}
          className="px-3 py-2.5 border border-border rounded-xl bg-background text-foreground text-sm focus:ring-2 focus:ring-ring"
        >
          <option value="">All difficulties</option>
          <option value="EASY">Easy</option>
          <option value="MEDIUM">Medium</option>
          <option value="HARD">Hard</option>
        </select>
      </div>

      {/* Recipe grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : recipes.length === 0 ? (
        <div className="text-center py-24">
          <ChefHat className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            {query ? 'No recipes found for your search' : 'No recipes yet — generate one with AI!'}
          </p>
          <Button onClick={() => setShowGenerateModal(true)} className="mt-4 gap-2">
            <Sparkles className="h-4 w-4" />
            Generate Recipe
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {recipes.map(recipe => (
            <div key={recipe.id} className="group bg-background rounded-2xl border border-border overflow-hidden transition-shadow">
              <Link href={`/dashboard/recipes/${recipe.id}`}>
                <div className="h-36 bg-secondary flex items-center justify-center">
                  {recipe.imageUrl ? (
                    <img src={recipe.imageUrl} alt={recipe.title} className="w-full h-full object-cover" />
                  ) : (
                    <ChefHat className="h-10 w-10 text-muted-foreground" />
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-medium text-foreground text-sm line-clamp-2 group-active transition-colors">
                    {recipe.title}
                  </h3>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {recipe.prepTime + recipe.cookTime}m
                    </span>
                    {recipe.rating != null && recipe.rating > 0 && (
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 text-foreground" />
                        {recipe.rating.toFixed(1)}
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${difficultyColor(recipe.difficulty)}`}>
                      {recipe.difficulty.charAt(0) + recipe.difficulty.slice(1).toLowerCase()}
                    </span>
                  </div>
                </div>
              </Link>
              <div className="px-4 pb-4">
                <button
                  onClick={() => toggleFavorite(recipe)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    recipe.isFavorited
                      ? 'text-destructive active:text-destructive'
                      : 'text-muted-foreground active:text-destructive'
                  }`}
                >
                  <Heart className={`h-4 w-4 ${recipe.isFavorited ? 'fill-current' : ''}`} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Generate Recipe Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-background rounded-2xl w-full max-w-lg p-6">
            <h2 className="text-lg font-medium text-foreground mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Generate Recipe with AI
            </h2>

            {!generatedRecipe ? (
              <>
                <textarea
                  value={generatePrompt}
                  onChange={e => setGeneratePrompt(e.target.value)}
                  placeholder="Describe the recipe you want, e.g. 'A healthy pasta dish with spinach and chicken, under 30 minutes'"
                  rows={4}
                  className="w-full px-4 py-3 border border-border rounded-xl bg-secondary text-foreground placeholder:text-muted-foreground text-sm resize-none focus:ring-2 focus:ring-ring focus:border-transparent"
                />
                <div className="flex gap-3 mt-4">
                  <Button
                    variant="outline"
                    onClick={() => { setShowGenerateModal(false); setGeneratePrompt(''); }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={generateRecipe}
                    disabled={!generatePrompt.trim() || isGenerating}
                    className="flex-1 gap-2"
                  >
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {isGenerating ? 'Generating...' : 'Generate'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-secondary rounded-xl p-4 max-h-96 overflow-y-auto">
                  <pre className="text-sm text-foreground whitespace-pre-wrap font-sans">
                    {generatedRecipe}
                  </pre>
                </div>
                <div className="flex gap-3 mt-4">
                  <Button
                    variant="outline"
                    onClick={() => { setGeneratedRecipe(null); setGeneratePrompt(''); }}
                    className="flex-1"
                  >
                    Try Again
                  </Button>
                  <Button
                    onClick={() => { setShowGenerateModal(false); setGeneratedRecipe(null); setGeneratePrompt(''); }}
                    className="flex-1"
                  >
                    Done
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
