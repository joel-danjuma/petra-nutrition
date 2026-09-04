'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShoppingCart, Plus, Loader2, Sparkles, Trash2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface ShoppingList {
  id: string;
  name: string;
  description: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  items: any[];
  createdAt: string;
}

export default function ShoppingListsPage() {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const token = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token
    : null;

  useEffect(() => { loadLists(); }, []);

  const loadLists = async () => {
    try {
      const res = await fetch(`${API_URL}/shopping-lists`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setLists(data.data.shoppingLists || []);
    } catch {
      toast.error('Failed to load shopping lists');
    } finally {
      setIsLoading(false);
    }
  };

  const createList = async () => {
    if (!newListName.trim()) { toast.error('Name is required'); return; }
    setIsCreating(true);
    try {
      const res = await fetch(`${API_URL}/shopping-lists`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newListName }),
      });
      const data = await res.json();
      if (data.success) {
        setLists(prev => [data.data, ...prev]);
        setShowCreateModal(false);
        setNewListName('');
        toast.success('Shopping list created');
      }
    } catch {
      toast.error('Failed to create shopping list');
    } finally {
      setIsCreating(false);
    }
  };

  const deleteList = async (id: string) => {
    if (!confirm('Delete this shopping list?')) return;
    try {
      await fetch(`${API_URL}/shopping-lists/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setLists(prev => prev.filter(l => l.id !== id));
      toast.success('Shopping list deleted');
    } catch {
      toast.error('Failed to delete shopping list');
    }
  };

  const markComplete = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/shopping-lists/${id}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setLists(prev => prev.map(l => l.id === id ? { ...l, isCompleted: true, completedAt: new Date().toISOString() } : l));
        toast.success('Shopping trip complete!');
      }
    } catch {
      toast.error('Failed to mark complete');
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-medium text-foreground">Shopping Lists</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your grocery shopping</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New List
        </Button>
      </div>

      {/* Lists */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : lists.length === 0 ? (
        <div className="text-center py-24">
          <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No shopping lists yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create a list manually or generate one from a meal plan
          </p>
          <div className="flex gap-3 justify-center mt-4">
            <Button onClick={() => setShowCreateModal(true)} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Create List
            </Button>
            <Link href="/dashboard/meal-plans">
              <Button className="gap-2">
                <Sparkles className="h-4 w-4" />
                Generate from Meal Plan
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {lists.map(list => {
            const completed = list.items?.filter((i: any) => i.isCompleted).length || 0;
            const total = list.items?.length || 0;

            return (
              <div key={list.id} className={`bg-background rounded-2xl border p-5 ${list.isCompleted ? 'border-border opacity-75' : 'border-border'}`}>
                <div className="flex items-start justify-between gap-4">
                  <Link href={`/dashboard/shopping-lists/${list.id}`} className="flex-1 min-w-0 group">
                    <div className="flex items-center gap-2">
                      {list.isCompleted && <CheckCircle className="h-4 w-4 text-primary shrink-0" />}
                      <h3 className={`font-medium text-sm group-active transition-colors ${list.isCompleted ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                        {list.name}
                      </h3>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span>{total} items{total > 0 ? ` · ${completed} checked` : ''}</span>
                      <span>{new Date(list.createdAt).toLocaleDateString()}</span>
                    </div>
                    {total > 0 && (
                      <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${(completed / total) * 100}%` }}
                        />
                      </div>
                    )}
                  </Link>
                  <div className="flex gap-2 shrink-0">
                    {!list.isCompleted && (
                      <button onClick={() => markComplete(list.id)} className="p-1.5 text-muted-foreground active:text-primary rounded-lg active:bg-secondary transition-colors" title="Mark complete">
                        <CheckCircle className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => deleteList(list.id)} className="p-1.5 text-muted-foreground active:text-destructive rounded-lg active:bg-secondary transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-background rounded-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-medium text-foreground mb-4">New Shopping List</h2>
            <input
              type="text"
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createList(); }}
              placeholder="List name..."
              className="w-full px-3 py-2.5 border border-border rounded-lg bg-secondary text-foreground text-sm focus:ring-2 focus:ring-ring focus:border-transparent"
              autoFocus
            />
            <div className="flex gap-3 mt-4">
              <Button variant="outline" onClick={() => { setShowCreateModal(false); setNewListName(''); }} className="flex-1">Cancel</Button>
              <Button onClick={createList} disabled={isCreating} className="flex-1">
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
