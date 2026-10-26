import { create } from 'zustand';
import {
  PantryItem,
  CreatePantryItem,
  UpdatePantryItem,
  PantrySearch,
  PantryStats,
  RecognitionResult,
} from '../types';
import { errorMessage } from '../api/errors';
import { requireApiEndpoints } from '../api/registry';

interface PantryState {
  items: PantryItem[];
  stats: PantryStats | null;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  filters: Partial<PantrySearch>;
  selectedItems: string[];
}

interface PantryActions {
  fetchItems: (params?: PantrySearch) => Promise<void>;
  fetchStats: () => Promise<void>;
  addItem: (item: CreatePantryItem) => Promise<void>;
  updateItem: (id: string, updates: UpdatePantryItem) => Promise<void>;
  deleteItem: (id: string, reason?: 'used' | 'wasted') => Promise<void>;
  bulkUpdate: (items: Array<{ id: string; updates: UpdatePantryItem }>) => Promise<void>;
  scanBarcode: (barcode: string) => Promise<RecognitionResult>;
  recognizeImage: (imageData: string) => Promise<RecognitionResult>;
  setSearchQuery: (query: string) => void;
  setFilters: (filters: Partial<PantrySearch>) => void;
  toggleItemSelection: (id: string) => void;
  clearSelection: () => void;
  clearError: () => void;
  markLowStock: (id: string, threshold: number) => Promise<void>;
}

type PantryStore = PantryState & PantryActions;

export const usePantryStore = create<PantryStore>((set, get) => ({
  // Initial state
  items: [],
  stats: null,
  isLoading: false,
  error: null,
  searchQuery: '',
  filters: {},
  selectedItems: [],

  // Actions
  fetchItems: async (params?: PantrySearch) => {
    set({ isLoading: true, error: null });
    
    try {
      const api = requireApiEndpoints();

      const { items } = await api.pantry.getItems(params);
      set({
        items,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: errorMessage(error, 'Failed to fetch pantry items'),
      });
    }
  },

  fetchStats: async () => {
    try {
      const api = requireApiEndpoints();

      set({ stats: await api.pantry.getStats() });
    } catch (error) {
      console.error('Failed to fetch pantry stats:', error);
    }
  },

  addItem: async (item: CreatePantryItem) => {
    set({ isLoading: true, error: null });
    
    try {
      const api = requireApiEndpoints();

      const created = await api.pantry.create(item);
      const { items } = get();
      set({
        items: [...items, created],
        isLoading: false,
        error: null,
      });

      // Refresh stats
      get().fetchStats();
    } catch (error) {
      set({
        isLoading: false,
        error: errorMessage(error, 'Failed to add item'),
      });
      throw error;
    }
  },

  updateItem: async (id: string, updates: UpdatePantryItem) => {
    set({ isLoading: true, error: null });
    
    try {
      const api = requireApiEndpoints();

      const updated = await api.pantry.update(id, updates);
      const { items } = get();
      set({
        items: items.map(item => (item.id === id ? updated : item)),
        isLoading: false,
        error: null,
      });

      // Refresh stats
      get().fetchStats();
    } catch (error) {
      set({
        isLoading: false,
        error: errorMessage(error, 'Failed to update item'),
      });
      throw error;
    }
  },

  deleteItem: async (id: string, reason?: 'used' | 'wasted') => {
    set({ isLoading: true, error: null });

    try {
      const api = requireApiEndpoints();

      await api.pantry.delete(id, reason);
      const { items, selectedItems } = get();
      set({
        items: items.filter(item => item.id !== id),
        selectedItems: selectedItems.filter(itemId => itemId !== id),
        isLoading: false,
        error: null,
      });

      // Refresh stats
      get().fetchStats();
    } catch (error) {
      set({
        isLoading: false,
        error: errorMessage(error, 'Failed to delete item'),
      });
      throw error;
    }
  },

  bulkUpdate: async (itemUpdates: Array<{ id: string; updates: UpdatePantryItem }>) => {
    set({ isLoading: true, error: null });
    
    try {
      const api = requireApiEndpoints();

      await api.pantry.bulkUpdate(itemUpdates);
      // Refresh the entire list after bulk update
      await get().fetchItems();
    } catch (error) {
      set({
        isLoading: false,
        error: errorMessage(error, 'Failed to update items'),
      });
      throw error;
    }
  },

  scanBarcode: (barcode: string) =>
    requireApiEndpoints().pantry.scanBarcode({ barcode }),

  recognizeImage: (imageData: string) =>
    requireApiEndpoints().pantry.recognizeImage({
      imageBase64: imageData,
      context: 'pantry_item',
    }),

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  setFilters: (filters: Partial<PantrySearch>) => {
    set({ filters });
  },

  toggleItemSelection: (id: string) => {
    const { selectedItems } = get();
    const isSelected = selectedItems.includes(id);
    
    set({
      selectedItems: isSelected
        ? selectedItems.filter(itemId => itemId !== id)
        : [...selectedItems, id]
    });
  },

  clearSelection: () => {
    set({ selectedItems: [] });
  },

  clearError: () => {
    set({ error: null });
  },

  markLowStock: async (id: string, threshold: number) => {
    await get().updateItem(id, { 
      isLowStock: true, 
      lowStockThreshold: threshold 
    });
  },
}));

// Utility hooks
export const usePantry = () => {
  const store = usePantryStore();
  return {
    items: store.items,
    stats: store.stats,
    isLoading: store.isLoading,
    error: store.error,
    searchQuery: store.searchQuery,
    filters: store.filters,
    selectedItems: store.selectedItems,
    fetchItems: store.fetchItems,
    fetchStats: store.fetchStats,
    addItem: store.addItem,
    updateItem: store.updateItem,
    deleteItem: store.deleteItem,
    bulkUpdate: store.bulkUpdate,
    scanBarcode: store.scanBarcode,
    recognizeImage: store.recognizeImage,
    setSearchQuery: store.setSearchQuery,
    setFilters: store.setFilters,
    toggleItemSelection: store.toggleItemSelection,
    clearSelection: store.clearSelection,
    clearError: store.clearError,
    markLowStock: store.markLowStock,
  };
};

export const usePantryItems = () => {
  return usePantryStore(state => state.items);
};

export const usePantryStats = () => {
  return usePantryStore(state => state.stats);
};
