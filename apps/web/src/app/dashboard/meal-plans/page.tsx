'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, Plus, Loader2, Sparkles, Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface MealPlan {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  meals: any[];
}

export default function MealPlansPage() {
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateForm, setGenerateForm] = useState({ days: 7, preferences: '' });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);

  const token = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token
    : null;

  useEffect(() => { loadPlans(); }, []);

  const loadPlans = async () => {
    try {
      const res = await fetch(`${API_URL}/meal-plans`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setPlans(data.data.mealPlans || []);
    } catch {
      toast.error('Failed to load meal plans');
    } finally {
      setIsLoading(false);
    }
  };

  const deletePlan = async (id: string) => {
    if (!confirm('Delete this meal plan?')) return;
    try {
      await fetch(`${API_URL}/meal-plans/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setPlans(prev => prev.filter(p => p.id !== id));
      toast.success('Meal plan deleted');
    } catch {
      toast.error('Failed to delete meal plan');
    }
  };

  const duplicatePlan = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/meal-plans/${id}/duplicate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setPlans(prev => [data.data, ...prev]);
        toast.success('Meal plan duplicated');
      }
    } catch {
      toast.error('Failed to duplicate meal plan');
    }
  };

  const generatePlan = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch(`${API_URL}/meal-plans/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: generateForm.days, preferences: generateForm.preferences ? { notes: generateForm.preferences } : undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedContent(data.data.content || JSON.stringify(data.data.structuredData, null, 2));
      } else throw new Error(data.error?.message);
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate meal plan');
    } finally {
      setIsGenerating(false);
    }
  };

  const dayCount = (plan: MealPlan) => {
    const start = new Date(plan.startDate);
    const end = new Date(plan.endDate);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Meal Plans</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Plan your meals for the week</p>
        </div>
        <Button onClick={() => setShowGenerateModal(true)} className="gap-2">
          <Sparkles className="h-4 w-4" />
          Generate with AI
        </Button>
      </div>

      {/* Plans */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
        </div>
      ) : plans.length === 0 ? (
        <div className="text-center py-24">
          <Calendar className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">No meal plans yet</p>
          <Button onClick={() => setShowGenerateModal(true)} className="mt-4 gap-2">
            <Sparkles className="h-4 w-4" />
            Create Your First Plan
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map(plan => (
            <div key={plan.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
              <div className="flex items-start justify-between gap-4">
                <Link href={`/dashboard/meal-plans/${plan.id}`} className="flex-1 min-w-0 group">
                  <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-green-600 transition-colors">
                    {plan.name}
                  </h3>
                  {plan.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">{plan.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(plan.startDate).toLocaleDateString()} – {new Date(plan.endDate).toLocaleDateString()}
                    </span>
                    <span>{dayCount(plan)} days · {plan.meals?.length || 0} meals</span>
                  </div>
                </Link>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => duplicatePlan(plan.id)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                    <Copy className="h-4 w-4" />
                  </button>
                  <button onClick={() => deletePlan(plan.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Generate Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-green-600" />
              Generate Meal Plan
            </h2>

            {!generatedContent ? (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Number of days</label>
                    <select
                      value={generateForm.days}
                      onChange={e => setGenerateForm(p => ({ ...p, days: parseInt(e.target.value) }))}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-green-500"
                    >
                      <option value={1}>1 day (Free)</option>
                      <option value={3}>3 days (Premium)</option>
                      <option value={7}>7 days (Premium)</option>
                      <option value={14}>14 days (Premium)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Preferences (optional)</label>
                    <textarea
                      value={generateForm.preferences}
                      onChange={e => setGenerateForm(p => ({ ...p, preferences: e.target.value }))}
                      placeholder="E.g. vegetarian, low-carb, family of 4, budget-friendly..."
                      rows={3}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm resize-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <Button variant="outline" onClick={() => setShowGenerateModal(false)} className="flex-1">Cancel</Button>
                  <Button onClick={generatePlan} disabled={isGenerating} className="flex-1 gap-2">
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {isGenerating ? 'Generating...' : 'Generate'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 max-h-80 overflow-y-auto">
                  <pre className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-sans">{generatedContent}</pre>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Copy this plan and create a new meal plan manually, or use the AI Chat to save it.
                </p>
                <div className="flex gap-3 mt-4">
                  <Button variant="outline" onClick={() => { setGeneratedContent(null); }} className="flex-1">Try Again</Button>
                  <Button onClick={() => { setShowGenerateModal(false); setGeneratedContent(null); }} className="flex-1">Done</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
