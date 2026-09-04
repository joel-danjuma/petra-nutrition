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
          <h1 className="text-2xl font-medium text-foreground">Meal Plans</h1>
          <p className="text-muted-foreground text-sm mt-1">Plan your meals for the week</p>
        </div>
        <Button onClick={() => setShowGenerateModal(true)} className="gap-2">
          <Sparkles className="h-4 w-4" />
          Generate with AI
        </Button>
      </div>

      {/* Plans */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : plans.length === 0 ? (
        <div className="text-center py-24">
          <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No meal plans yet</p>
          <Button onClick={() => setShowGenerateModal(true)} className="mt-4 gap-2">
            <Sparkles className="h-4 w-4" />
            Create Your First Plan
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map(plan => (
            <div key={plan.id} className="bg-background rounded-2xl border border-border p-5">
              <div className="flex items-start justify-between gap-4">
                <Link href={`/dashboard/meal-plans/${plan.id}`} className="flex-1 min-w-0 group">
                  <h3 className="font-medium text-foreground group-active transition-colors">
                    {plan.name}
                  </h3>
                  {plan.description && (
                    <p className="text-sm text-muted-foreground mt-1 truncate">{plan.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(plan.startDate).toLocaleDateString()} – {new Date(plan.endDate).toLocaleDateString()}
                    </span>
                    <span>{dayCount(plan)} days · {plan.meals?.length || 0} meals</span>
                  </div>
                </Link>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => duplicatePlan(plan.id)} className="p-1.5 text-muted-foreground active:text-foreground rounded-lg active:bg-secondary transition-colors">
                    <Copy className="h-4 w-4" />
                  </button>
                  <button onClick={() => deletePlan(plan.id)} className="p-1.5 text-muted-foreground active:text-destructive rounded-lg active:bg-secondary transition-colors">
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
          <div className="bg-background rounded-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-medium text-foreground mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Generate Meal Plan
            </h2>

            {!generatedContent ? (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Number of days</label>
                    <select
                      value={generateForm.days}
                      onChange={e => setGenerateForm(p => ({ ...p, days: parseInt(e.target.value) }))}
                      className="w-full px-3 py-2.5 border border-border rounded-lg bg-secondary text-foreground text-sm focus:ring-2 focus:ring-ring"
                    >
                      <option value={1}>1 day (Free)</option>
                      <option value={3}>3 days (Premium)</option>
                      <option value={7}>7 days (Premium)</option>
                      <option value={14}>14 days (Premium)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Preferences (optional)</label>
                    <textarea
                      value={generateForm.preferences}
                      onChange={e => setGenerateForm(p => ({ ...p, preferences: e.target.value }))}
                      placeholder="E.g. vegetarian, low-carb, family of 4, budget-friendly..."
                      rows={3}
                      className="w-full px-3 py-2.5 border border-border rounded-lg bg-secondary text-foreground text-sm resize-none focus:ring-2 focus:ring-ring focus:border-transparent"
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
                <div className="bg-secondary rounded-xl p-4 max-h-80 overflow-y-auto">
                  <pre className="text-xs text-foreground whitespace-pre-wrap font-sans">{generatedContent}</pre>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
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
