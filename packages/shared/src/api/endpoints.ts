import { ApiClient } from './client';
import {
  User, AuthResponse, CreateUser, UpdateUser, Login, PasswordReset, PasswordResetConfirm,
  Recipe, CreateRecipe, UpdateRecipe, RecipeSearch, RecipeSearchResponse, RecipeGenerationRequest,
  PantryItem, CreatePantryItem, UpdatePantryItem, PantrySearch, PantrySearchResponse, PantryStats,
  BarcodeRecognition, ImageRecognition, RecognitionResult,
  MealPlan, CreateMealPlan, UpdateMealPlan, MealPlanSearch, MealPlanSearchResponse,
  MealPlanGenerationRequest, QuickMealSuggestion,
  ShoppingList, CreateShoppingList, UpdateShoppingList, ShoppingListSearch, ShoppingListSearchResponse,
  GenerateShoppingList, BulkUpdateShoppingListItems,
  ChatSession, CreateChatSession, SendMessage, ChatSessionSearch, ChatSessionSearchResponse,
  ApiResponse, PaginatedResponse
} from '../types';

export class PetraApiEndpoints {
  constructor(private client: ApiClient) {}

  // Auth endpoints
  auth = {
    register: (data: CreateUser): Promise<ApiResponse<AuthResponse>> =>
      this.client.post('/auth/register', data),

    login: (data: Login): Promise<ApiResponse<AuthResponse>> =>
      this.client.post('/auth/login', data),

    logout: (): Promise<ApiResponse<void>> =>
      this.client.post('/auth/logout'),

    refreshToken: (): Promise<ApiResponse<AuthResponse>> =>
      this.client.post('/auth/refresh'),

    requestPasswordReset: (data: PasswordReset): Promise<ApiResponse<void>> =>
      this.client.post('/auth/password-reset', data),

    confirmPasswordReset: (data: PasswordResetConfirm): Promise<ApiResponse<void>> =>
      this.client.post('/auth/password-reset/confirm', data),

    verifyEmail: (token: string): Promise<ApiResponse<void>> =>
      this.client.post(`/auth/verify-email/${token}`),

    resendVerification: (): Promise<ApiResponse<void>> =>
      this.client.post('/auth/resend-verification'),
  };

  // User endpoints
  users = {
    getProfile: (): Promise<ApiResponse<User>> =>
      this.client.get('/users/profile'),

    updateProfile: (data: UpdateUser): Promise<ApiResponse<User>> =>
      this.client.patch('/users/profile', data),

    deleteAccount: (): Promise<ApiResponse<void>> =>
      this.client.delete('/users/profile'),

    uploadAvatar: (file: File): Promise<ApiResponse<{ avatarUrl: string }>> =>
      this.client.uploadFile('/users/avatar', file, 'avatar'),
  };

  // Recipe endpoints
  recipes = {
    search: (params: RecipeSearch): Promise<ApiResponse<RecipeSearchResponse>> =>
      this.client.get('/recipes/search', { params }),

    getById: (id: string): Promise<ApiResponse<Recipe>> =>
      this.client.get(`/recipes/${id}`),

    create: (data: CreateRecipe): Promise<ApiResponse<Recipe>> =>
      this.client.post('/recipes', data),

    update: (id: string, data: UpdateRecipe): Promise<ApiResponse<Recipe>> =>
      this.client.patch(`/recipes/${id}`, data),

    delete: (id: string): Promise<ApiResponse<void>> =>
      this.client.delete(`/recipes/${id}`),

    generate: (data: RecipeGenerationRequest): Promise<ApiResponse<Recipe>> =>
      this.client.post('/recipes/generate', data),

    favorite: (id: string): Promise<ApiResponse<void>> =>
      this.client.post(`/recipes/${id}/favorite`),

    unfavorite: (id: string): Promise<ApiResponse<void>> =>
      this.client.delete(`/recipes/${id}/favorite`),

    getFavorites: (): Promise<ApiResponse<RecipeSearchResponse>> =>
      this.client.get('/recipes/favorites'),

    rate: (id: string, rating: number): Promise<ApiResponse<void>> =>
      this.client.post(`/recipes/${id}/rate`, { rating }),
  };

  // Pantry endpoints
  pantry = {
    getItems: (params?: PantrySearch): Promise<ApiResponse<PantrySearchResponse>> =>
      this.client.get('/pantry', { params }),

    getById: (id: string): Promise<ApiResponse<PantryItem>> =>
      this.client.get(`/pantry/${id}`),

    create: (data: CreatePantryItem): Promise<ApiResponse<PantryItem>> =>
      this.client.post('/pantry', data),

    update: (id: string, data: UpdatePantryItem): Promise<ApiResponse<PantryItem>> =>
      this.client.patch(`/pantry/${id}`, data),

    delete: (id: string): Promise<ApiResponse<void>> =>
      this.client.delete(`/pantry/${id}`),

    getStats: (): Promise<ApiResponse<PantryStats>> =>
      this.client.get('/pantry/stats'),

    scanBarcode: (data: BarcodeRecognition): Promise<ApiResponse<RecognitionResult>> =>
      this.client.post('/pantry/scan/barcode', data),

    recognizeImage: (data: ImageRecognition): Promise<ApiResponse<RecognitionResult>> =>
      this.client.post('/pantry/scan/image', data),

    uploadImage: (file: File, context?: string): Promise<ApiResponse<RecognitionResult>> =>
      this.client.uploadFile('/pantry/scan/upload', file, 'image', { context }),

    bulkUpdate: (items: Array<{ id: string; updates: UpdatePantryItem }>): Promise<ApiResponse<PantryItem[]>> =>
      this.client.patch('/pantry/bulk', { items }),

    exportData: (): Promise<ApiResponse<{ downloadUrl: string }>> =>
      this.client.get('/pantry/export'),
  };

  // Meal plan endpoints
  mealPlans = {
    search: (params?: MealPlanSearch): Promise<ApiResponse<MealPlanSearchResponse>> =>
      this.client.get('/meal-plans', { params }),

    getById: (id: string): Promise<ApiResponse<MealPlan>> =>
      this.client.get(`/meal-plans/${id}`),

    create: (data: CreateMealPlan): Promise<ApiResponse<MealPlan>> =>
      this.client.post('/meal-plans', data),

    update: (id: string, data: UpdateMealPlan): Promise<ApiResponse<MealPlan>> =>
      this.client.patch(`/meal-plans/${id}`, data),

    delete: (id: string): Promise<ApiResponse<void>> =>
      this.client.delete(`/meal-plans/${id}`),

    generate: (data: MealPlanGenerationRequest): Promise<ApiResponse<MealPlan>> =>
      this.client.post('/meal-plans/generate', data),

    quickSuggestion: (data: QuickMealSuggestion): Promise<ApiResponse<Recipe[]>> =>
      this.client.post('/meal-plans/quick-suggestion', data),

    duplicate: (id: string): Promise<ApiResponse<MealPlan>> =>
      this.client.post(`/meal-plans/${id}/duplicate`),

    saveAsTemplate: (id: string): Promise<ApiResponse<MealPlan>> =>
      this.client.post(`/meal-plans/${id}/template`),
  };

  // Shopping list endpoints
  shoppingLists = {
    search: (params?: ShoppingListSearch): Promise<ApiResponse<ShoppingListSearchResponse>> =>
      this.client.get('/shopping-lists', { params }),

    getById: (id: string): Promise<ApiResponse<ShoppingList>> =>
      this.client.get(`/shopping-lists/${id}`),

    create: (data: CreateShoppingList): Promise<ApiResponse<ShoppingList>> =>
      this.client.post('/shopping-lists', data),

    update: (id: string, data: UpdateShoppingList): Promise<ApiResponse<ShoppingList>> =>
      this.client.patch(`/shopping-lists/${id}`, data),

    delete: (id: string): Promise<ApiResponse<void>> =>
      this.client.delete(`/shopping-lists/${id}`),

    generateFromMealPlan: (data: GenerateShoppingList): Promise<ApiResponse<ShoppingList>> =>
      this.client.post('/shopping-lists/generate', data),

    updateItems: (id: string, data: BulkUpdateShoppingListItems): Promise<ApiResponse<ShoppingList>> =>
      this.client.patch(`/shopping-lists/${id}/items`, data),

    markComplete: (id: string): Promise<ApiResponse<ShoppingList>> =>
      this.client.post(`/shopping-lists/${id}/complete`),

    share: (id: string, emails: string[]): Promise<ApiResponse<{ shareUrl: string }>> =>
      this.client.post(`/shopping-lists/${id}/share`, { emails }),

    export: (id: string, format: 'pdf' | 'csv'): Promise<ApiResponse<{ downloadUrl: string }>> =>
      this.client.get(`/shopping-lists/${id}/export?format=${format}`),
  };

  // Chat endpoints
  chat = {
    getSessions: (params?: ChatSessionSearch): Promise<ApiResponse<ChatSessionSearchResponse>> =>
      this.client.get('/chat/sessions', { params }),

    getSession: (id: string): Promise<ApiResponse<ChatSession>> =>
      this.client.get(`/chat/sessions/${id}`),

    createSession: (data?: CreateChatSession): Promise<ApiResponse<ChatSession>> =>
      this.client.post('/chat/sessions', data),

    deleteSession: (id: string): Promise<ApiResponse<void>> =>
      this.client.delete(`/chat/sessions/${id}`),

    sendMessage: (data: SendMessage): Promise<ApiResponse<any>> =>
      this.client.post('/chat/message', data),

    streamMessage: (
      data: SendMessage,
      onChunk: (chunk: string) => void,
      onComplete: () => void,
      onError: (error: any) => void
    ): Promise<void> =>
      this.client.streamRequest('/chat/stream', data, onChunk, onComplete, onError),

    updateSessionTitle: (id: string, title: string): Promise<ApiResponse<ChatSession>> =>
      this.client.patch(`/chat/sessions/${id}`, { title }),

    clearHistory: (id: string): Promise<ApiResponse<ChatSession>> =>
      this.client.delete(`/chat/sessions/${id}/messages`),
  };

  // Subscription endpoints
  subscription = {
    getStatus: (): Promise<ApiResponse<{ tier: string; expiresAt?: string; features: string[] }>> =>
      this.client.get('/subscription/status'),

    upgrade: (tier: string): Promise<ApiResponse<{ checkoutUrl: string }>> =>
      this.client.post('/subscription/upgrade', { tier }),

    cancel: (): Promise<ApiResponse<void>> =>
      this.client.post('/subscription/cancel'),

    getUsage: (): Promise<ApiResponse<{ 
      chatMessages: number; 
      recipeGenerations: number; 
      mealPlans: number; 
      limits: Record<string, number> 
    }>> =>
      this.client.get('/subscription/usage'),
  };

  // Analytics endpoints (for internal use)
  analytics = {
    getUserStats: (): Promise<ApiResponse<{
      totalRecipes: number;
      totalMealPlans: number;
      pantryItems: number;
      chatSessions: number;
      lastActivity: string;
    }>> =>
      this.client.get('/analytics/user-stats'),

    getFeatureUsage: (): Promise<ApiResponse<Record<string, number>>> =>
      this.client.get('/analytics/feature-usage'),
  };
}
