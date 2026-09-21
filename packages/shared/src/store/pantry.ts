import { create } from 'zustand';
import { PantryItem, CreatePantryItem, UpdatePantryItem, PantrySearch, PantryStats } from '../types';
import { requireApiEndpoints } from '../api';

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
  scanBarcode: (barcode: string) => Promise<any>;
  recognizeImage: (imageData: string) => Promise<any>;
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

      const response = await api.pantry.getItems(params);
      
      if (response.success && response.data) {
        set({
          items: response.data.items,
          isLoading: false,
          error: null,
        });
      } else {
        throw new Error(response.error?.message || 'Failed to fetch pantry items');
      }
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.message || 'Failed to fetch pantry items',
      });
    }
  },

  fetchStats: async () => {
    try {
      const api = requireApiEndpoints();

      const response = await api.pantry.getStats();
      
      if (response.success && response.data) {
        set({ stats: response.data });
      }
    } catch (error: any) {
      console.error('Failed to fetch pantry stats:', error);
    }
  },

  addItem: async (item: CreatePantryItem) => {
    set({ isLoading: true, error: null });
    
    try {
      const api = requireApiEndpoints();

      const response = await api.pantry.create(item);
      
      if (response.success && response.data) {
        const { items } = get();
        set({
          items: [...items, response.data],
          isLoading: false,
          error: null,
        });
        
        // Refresh stats
        get().fetchStats();
      } else {
        throw new Error(response.error?.message || 'Failed to add item');
      }
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.message || 'Failed to add item',
      });
      throw error;
    }
  },

  updateItem: async (id: string, updates: UpdatePantryItem) => {
    set({ isLoading: true, error: null });
    
    try {
      const api = requireApiEndpoints();

      const response = await api.pantry.update(id, updates);
      
      if (response.success && response.data) {
        const { items } = get();
        const updatedItems = items.map(item => 
          item.id === id ? response.data! : item
        );
        
        set({
          items: updatedItems,
          isLoading: false,
          error: null,
        });
        
        // Refresh stats
        get().fetchStats();
      } else {
        throw new Error(response.error?.message || 'Failed to update item');
      }
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.message || 'Failed to update item',
      });
      throw error;
    }
  },

  deleteItem: async (id: string, reason?: 'used' | 'wasted') => {
    set({ isLoading: true, error: null });

    try {
      const api = requireApiEndpoints();

      const response = await api.pantry.delete(id, reason);
      
      if (response.success) {
        const { items, selectedItems } = get();
        const updatedItems = items.filter(item => item.id !== id);
        const updatedSelection = selectedItems.filter(itemId => itemId !== id);
        
        set({
          items: updatedItems,
          selectedItems: updatedSelection,
          isLoading: false,
          error: null,
        });
        
        // Refresh stats
        get().fetchStats();
      } else {
        throw new Error(response.error?.message || 'Failed to delete item');
      }
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.message || 'Failed to delete item',
      });
      throw error;
    }
  },

  bulkUpdate: async (itemUpdates: Array<{ id: string; updates: UpdatePantryItem }>) => {
    set({ isLoading: true, error: null });
    
    try {
      const api = requireApiEndpoints();

      const response = await api.pantry.bulkUpdate(itemUpdates);
      
      if (response.success && response.data) {
        // Refresh the entire list after bulk update
        await get().fetchItems();
      } else {
        throw new Error(response.error?.message || 'Failed to update items');
      }
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.message || 'Failed to update items',
      });
      throw error;
    }
  },

  scanBarcode: async (barcode: string) => {
    try {
      const api = requireApiEndpoints();

      const response = await api.pantry.scanBarcode({ barcode });
      
      if (response.success && response.data) {
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Barcode scan failed');
      }
    } catch (error: any) {
      throw error;
    }
  },

  recognizeImage: async (imageData: string) => {
    try {
      const api = requireApiEndpoints();

      const response = await api.pantry.recognizeImage({ 
        imageBase64: imageData,
        context: 'pantry_item'
      });
      
      if (response.success && response.data) {
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Image recognition failed');
      }
    } catch (error: any) {
      throw error;
    }
  },

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
