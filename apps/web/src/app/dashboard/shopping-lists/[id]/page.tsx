'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Loader2, CheckSquare, Square, Trash2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const CATEGORIES = ['PRODUCE', 'DAIRY', 'MEAT', 'SEAFOOD', 'GRAINS', 'PANTRY_STAPLES', 'BEVERAGES', 'FROZEN', 'CANNED', 'SNACKS', 'OTHER'];

export default function ShoppingListDetailPage({ params }: { params: { id: string } }) {
  const [list, setList] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const [isAddingItem, setIsAddingItem] = useState(false);

  const token = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token
    : null;

  useEffect(() => { loadList(); }, [params.id]);

  const loadList = async () => {
    try {
      const res = await fetch(`${API_URL}/shopping-lists/${params.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setList(data.data);
      else toast.error('Shopping list not found');
    } catch {
      toast.error('Failed to load shopping list');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleItem = async (item: any) => {
    const updated = { ...item, isCompleted: !item.isCompleted };
    setList((prev: any) => ({
      ...prev,
      items: prev.items.map((i: any) => i.id === item.id ? updated : i),
    }));
    try {
      await fetch(`${API_URL}/shopping-lists/${params.id}/items`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [updated] }),
      });
    } catch {
      toast.error('Failed to update item');
      loadList();
    }
  };

  const addItem = async () => {
    if (!newItemName.trim()) return;
    setIsAddingItem(true);
    try {
      const newItem = { name: newItemName.trim(), quantity: 1, unit: 'pcs', category: 'OTHER', isCompleted: false };
      const res = await fetch(`${API_URL}/shopping-lists/${params.id}/items`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [newItem] }),
      });
      const data = await res.json();
      if (data.success) {
        setList(data.data);
        setNewItemName('');
      }
    } catch {
      toast.error('Failed to add item');
    } finally {
      setIsAddingItem(false);
    }
  };

  const exportList = async () => {
    try {
      const res = await fetch(`${API_URL}/shopping-lists/${params.id}/export?format=csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${list?.name || 'shopping-list'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to export list');
    }
  };

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!list) return <div className="text-center py-24 text-muted-foreground">Shopping list not found.</div>;

  // Group items by category
  const itemsByCategory: Record<string, any[]> = {};
  for (const item of list.items || []) {
    if (!itemsByCategory[item.category]) itemsByCategory[item.category] = [];
    itemsByCategory[item.category].push(item);
  }

  const completedCount = list.items?.filter((i: any) => i.isCompleted).length || 0;
  const totalCount = list.items?.length || 0;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/shopping-lists" className="p-2 text-muted-foreground active:text-foreground rounded-lg active:bg-secondary transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-medium text-foreground truncate">{list.name}</h1>
          <p className="text-sm text-muted-foreground">{completedCount}/{totalCount} items checked</p>
        </div>
        <button onClick={exportList} className="p-2 text-muted-foreground active:text-muted-foreground rounded-lg active:bg-secondary transition-colors" title="Export CSV">
          <Download className="h-4 w-4" />
        </button>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="h-2 bg-secondary rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${(completedCount / totalCount) * 100}%` }}
          />
        </div>
      )}

      {/* Add item */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={newItemName}
          onChange={e => setNewItemName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addItem(); }}
          placeholder="Add item..."
          className="flex-1 px-3 py-2.5 border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground text-sm focus:ring-2 focus:ring-ring focus:border-transparent"
        />
        <Button onClick={addItem} disabled={isAddingItem || !newItemName.trim()} size="sm" className="h-10 w-10 p-0">
          {isAddingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>

      {/* Items grouped by category */}
      {Object.keys(itemsByCategory).length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          No items yet — add your first item above
        </div>
      ) : (
        <div className="space-y-5">
          {CATEGORIES.filter(c => itemsByCategory[c]?.length > 0).map(category => (
            <div key={category}>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                {category.replace(/_/g, ' ')}
              </h3>
              <div className="space-y-1.5">
                {itemsByCategory[category].map((item: any) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${
                      item.isCompleted
                        ? 'border-border bg-secondary'
                        : 'border-border bg-background active:border-border'
                    }`}
                    onClick={() => toggleItem(item)}
                  >
                    {item.isCompleted ? (
                      <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm ${item.isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        {item.name}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {item.quantity} {item.unit}
                      </span>
                    </div>
                    {item.recipeName && (
                      <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                        {item.recipeName}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Items with uncategorized/OTHER */}
          {itemsByCategory['OTHER'] && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Other</h3>
              <div className="space-y-1.5">
                {itemsByCategory['OTHER'].map((item: any) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      item.isCompleted ? 'border-border bg-secondary' : 'border-border bg-background active:border-border'
                    }`}
                    onClick={() => toggleItem(item)}
                  >
                    {item.isCompleted ? <CheckSquare className="h-4 w-4 text-primary shrink-0" /> : <Square className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <span className={`text-sm flex-1 ${item.isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {item.name}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">{item.quantity} {item.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
