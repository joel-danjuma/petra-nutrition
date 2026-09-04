'use client';

import { useState, useEffect } from 'react';
import { Package, Plus, Search, Loader2, Trash2, Edit2, AlertTriangle, BarChart2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface PantryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  location: string;
  expirationDate: string | null;
  isLowStock: boolean;
  brand: string | null;
}

const CATEGORIES = ['All', 'PRODUCE', 'DAIRY', 'MEAT', 'SEAFOOD', 'GRAINS', 'PANTRY_STAPLES', 'SPICES', 'CONDIMENTS', 'BEVERAGES', 'FROZEN', 'CANNED', 'SNACKS', 'OTHER'];
const LOCATIONS = ['PANTRY', 'FRIDGE', 'FREEZER'];
const CATEGORY_OPTIONS = CATEGORIES.slice(1);

export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editItem, setEditItem] = useState<PantryItem | null>(null);
  const [formData, setFormData] = useState({
    name: '', category: 'OTHER', quantity: 1, unit: 'pcs', location: 'PANTRY', expirationDate: '', brand: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const token = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token
    : null;

  useEffect(() => { loadItems(); }, [query, activeCategory]);

  const loadItems = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      if (activeCategory !== 'All') params.set('category', activeCategory);
      params.set('limit', '100');

      const res = await fetch(`${API_URL}/pantry?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setItems(data.data.items || []);
    } catch {
      toast.error('Failed to load pantry items');
    } finally {
      setIsLoading(false);
    }
  };

  const openAdd = () => {
    setEditItem(null);
    setFormData({ name: '', category: 'OTHER', quantity: 1, unit: 'pcs', location: 'PANTRY', expirationDate: '', brand: '' });
    setShowAddModal(true);
  };

  const openEdit = (item: PantryItem) => {
    setEditItem(item);
    setFormData({
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      location: item.location,
      expirationDate: item.expirationDate ? item.expirationDate.split('T')[0] : '',
      brand: item.brand || '',
    });
    setShowAddModal(true);
  };

  const saveItem = async () => {
    if (!formData.name.trim()) { toast.error('Name is required'); return; }
    setIsSaving(true);
    try {
      const body = { ...formData, expirationDate: formData.expirationDate || undefined, brand: formData.brand || undefined };
      const url = editItem ? `${API_URL}/pantry/${editItem.id}` : `${API_URL}/pantry`;
      const method = editItem ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(editItem ? 'Item updated' : 'Item added');
        setShowAddModal(false);
        loadItems();
      } else {
        throw new Error(data.error?.message);
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to save item');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    try {
      await fetch(`${API_URL}/pantry/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems(prev => prev.filter(i => i.id !== id));
      toast.success('Item deleted');
    } catch {
      toast.error('Failed to delete item');
    }
  };

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false;
    const d = new Date(date);
    return d.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000 && d.getTime() > Date.now();
  };

  const isExpired = (date: string | null) => {
    if (!date) return false;
    return new Date(date).getTime() < Date.now();
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-medium text-foreground">Pantry</h1>
          <p className="text-muted-foreground text-sm mt-1">{items.length} items tracked</p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Item
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search pantry..."
          className="w-full pl-10 pr-4 py-2.5 border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent text-sm"
        />
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {CATEGORIES.slice(0, 8).map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeCategory === cat
                ? 'bg-primary text-white'
                : 'bg-background text-muted-foreground border border-border active:border-border'
            }`}
          >
            {cat.charAt(0) + cat.slice(1).replace(/_/g, ' ').toLowerCase()}
          </button>
        ))}
      </div>

      {/* Items */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-24">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            {query ? 'No items match your search' : 'Your pantry is empty — start adding items!'}
          </p>
          <Button onClick={openAdd} className="mt-4 gap-2">
            <Plus className="h-4 w-4" />
            Add First Item
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(item => {
            const expired = isExpired(item.expirationDate);
            const expiringSoon = isExpiringSoon(item.expirationDate);
            return (
              <div
                key={item.id}
                className={`bg-background rounded-xl border p-4 ${
                  expired
                    ? 'border-border'
                    : expiringSoon
                    ? 'border-border'
                    : 'border-border'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground text-sm truncate">{item.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.quantity} {item.unit} · {item.location}
                    </p>
                    {item.brand && (
                      <p className="text-xs text-muted-foreground">{item.brand}</p>
                    )}
                    {(expired || expiringSoon) && (
                      <div className={`flex items-center gap-1 mt-1 text-xs ${expired ? 'text-destructive' : 'text-foreground'}`}>
                        <AlertTriangle className="h-3 w-3" />
                        {expired ? 'Expired' : 'Expiring soon'}
                      </div>
                    )}
                    {item.isLowStock && (
                      <p className="text-xs text-foreground mt-0.5">Low stock</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(item)} className="p-1.5 text-muted-foreground active:text-foreground rounded-lg active:bg-secondary transition-colors">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => deleteItem(item.id)} className="p-1.5 text-muted-foreground active:text-destructive rounded-lg active:bg-secondary transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {item.expirationDate && !expired && !expiringSoon && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Expires {new Date(item.expirationDate).toLocaleDateString()}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-background rounded-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-medium text-foreground mb-4">
              {editItem ? 'Edit Item' : 'Add Pantry Item'}
            </h2>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Item name *"
                value={formData.name}
                onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-secondary text-foreground text-sm focus:ring-2 focus:ring-ring focus:border-transparent"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  placeholder="Quantity"
                  min="0"
                  step="0.1"
                  value={formData.quantity}
                  onChange={e => setFormData(p => ({ ...p, quantity: parseFloat(e.target.value) }))}
                  className="px-3 py-2.5 border border-border rounded-lg bg-secondary text-foreground text-sm focus:ring-2 focus:ring-ring focus:border-transparent"
                />
                <input
                  type="text"
                  placeholder="Unit (e.g. kg, pcs)"
                  value={formData.unit}
                  onChange={e => setFormData(p => ({ ...p, unit: e.target.value }))}
                  className="px-3 py-2.5 border border-border rounded-lg bg-secondary text-foreground text-sm focus:ring-2 focus:ring-ring focus:border-transparent"
                />
              </div>
              <select
                value={formData.category}
                onChange={e => setFormData(p => ({ ...p, category: e.target.value }))}
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-secondary text-foreground text-sm focus:ring-2 focus:ring-ring"
              >
                {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
              <select
                value={formData.location}
                onChange={e => setFormData(p => ({ ...p, location: e.target.value }))}
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-secondary text-foreground text-sm focus:ring-2 focus:ring-ring"
              >
                {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <input
                type="date"
                placeholder="Expiration date"
                value={formData.expirationDate}
                onChange={e => setFormData(p => ({ ...p, expirationDate: e.target.value }))}
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-secondary text-foreground text-sm focus:ring-2 focus:ring-ring"
              />
              <input
                type="text"
                placeholder="Brand (optional)"
                value={formData.brand}
                onChange={e => setFormData(p => ({ ...p, brand: e.target.value }))}
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-secondary text-foreground text-sm focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex gap-3 mt-5">
              <Button variant="outline" onClick={() => setShowAddModal(false)} className="flex-1">Cancel</Button>
              <Button onClick={saveItem} disabled={isSaving} className="flex-1">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editItem ? 'Save Changes' : 'Add Item'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
