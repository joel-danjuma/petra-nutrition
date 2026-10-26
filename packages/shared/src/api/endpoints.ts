import { ApiClient, type FetchResponseLike } from './client';
import {
  User, AuthResponse, CreateUser, UpdateUser, Login, PasswordReset, PasswordResetConfirm,
  CompleteOnboarding,
  Recipe, CreateRecipe, UpdateRecipe, RecipeSearch, RecipeSearchResponse, RecipeGenerationRequest,
  PantryItem, CreatePantryItem, UpdatePantryItem, PantrySearch, PantrySearchResponse, PantryStats,
  BarcodeRecognition, ImageRecognition, RecognitionResult, ReceiptResult,
  MealPlan, CreateMealPlan, UpdateMealPlan, MealPlanSearch, MealPlanSearchResponse,
  MealPlanGenerationRequest, QuickMealSuggestion,
  ShoppingList, CreateShoppingList, UpdateShoppingList, ShoppingListSearch, ShoppingListSearchResponse,
  GenerateShoppingList, BulkUpsertShoppingListItems,
  ChatSession, CreateChatSession, ChatSessionSearch, ChatSessionSearchResponse,
  LogWasteEvent, LogMealCompletion, WasteSummary, TodayNutrition,
} from '../types';

/**
 * Model calls take far longer than a database read. The API gives the agent
 * 60s for a chat turn; this leaves room for the API's own work on either side.
 */
export const GENERATION_TIMEOUT_MS = 90_000;

/** `POST /chat/message` and `/chat/stream`: the text, and where it belongs. */
export interface ChatMessageRequest {
  /** Omitted or null, the API answers without a stored conversation. */
  sessionId?: string | null;
  message: string;
}

/**
 * Keep a dish the assistant composed. Opaque here: the API validates it
 * against the agent contract, and the client only sends back what it was given.
 */
export interface SaveGeneratedRecipe {
  recipe: unknown;
  nutrition?: unknown;
}

/**
 * Every endpoint the apps call, typed. Each resolves to the response's `data`
 * and rejects with an `ApiError` (see client.ts).
 */
export class PetraApiEndpoints {
  constructor(public readonly client: ApiClient) {}

  // Auth endpoints
  auth = {
    // Anonymous: a 401 from these means wrong credentials, not an expired
    // session, so it must not set off a refresh.
    register: (data: CreateUser): Promise<AuthResponse> =>
      this.client.post('/auth/register', data, { anonymous: true }),

    login: (data: Login): Promise<AuthResponse> =>
      this.client.post('/auth/login', data, { anonymous: true }),

    logout: (): Promise<void> =>
      this.client.post('/auth/logout', undefined, { refresh: false }),

    /** The API reads the refresh token from the body, not a header. */
    refreshToken: (refreshToken: string): Promise<AuthResponse> =>
      this.client.post('/auth/refresh', { refreshToken }, { anonymous: true }),

    requestPasswordReset: (data: PasswordReset): Promise<void> =>
      this.client.post('/auth/password-reset', data, { anonymous: true }),

    confirmPasswordReset: (data: PasswordResetConfirm): Promise<void> =>
      this.client.post('/auth/password-reset/confirm', data, {
        anonymous: true,
      }),

    verifyEmail: (token: string): Promise<void> =>
      this.client.post(`/auth/verify-email/${token}`, undefined, {
        anonymous: true,
      }),

    resendVerification: (): Promise<void> =>
      this.client.post('/auth/resend-verification'),
  };

  // User endpoints
  users = {
    getProfile: (): Promise<User> =>
      this.client.get('/users/profile'),

    updateProfile: (data: UpdateUser): Promise<User> =>
      this.client.patch('/users/profile', data),

    deleteAccount: (): Promise<void> =>
      this.client.delete('/users/profile'),

    uploadAvatar: (file: Blob): Promise<{ avatarUrl: string }> =>
      this.client.upload('/users/avatar', file, 'avatar'),

    completeOnboarding: (data: CompleteOnboarding): Promise<User> =>
      this.client.post('/users/onboarding', data),
  };

  // Recipe endpoints
  recipes = {
    search: (params: RecipeSearch): Promise<RecipeSearchResponse> =>
      this.client.get('/recipes/search', { params }),

    getById: (id: string): Promise<Recipe> =>
      this.client.get(`/recipes/${id}`),

    create: (data: CreateRecipe): Promise<Recipe> =>
      this.client.post('/recipes', data),

    update: (id: string, data: UpdateRecipe): Promise<Recipe> =>
      this.client.patch(`/recipes/${id}`, data),

    delete: (id: string): Promise<void> =>
      this.client.delete(`/recipes/${id}`),

    generate: (data: RecipeGenerationRequest): Promise<Recipe> =>
      this.client.post('/recipes/generate', data, {
        timeoutMs: GENERATION_TIMEOUT_MS,
      }),

    /** Persist a composed dish; resolves to the saved recipe. */
    saveGenerated: (data: SaveGeneratedRecipe): Promise<{ id: string }> =>
      this.client.post('/recipes/generated', data),

    favorite: (id: string): Promise<void> =>
      this.client.post(`/recipes/${id}/favorite`),

    unfavorite: (id: string): Promise<void> =>
      this.client.delete(`/recipes/${id}/favorite`),

    getFavorites: (): Promise<RecipeSearchResponse> =>
      this.client.get('/recipes/favorites'),

    rate: (id: string, rating: number): Promise<void> =>
      this.client.post(`/recipes/${id}/rate`, { rating }),
  };

  // Pantry endpoints
  pantry = {
    getItems: (params?: PantrySearch): Promise<PantrySearchResponse> =>
      this.client.get('/pantry', { params }),

    getById: (id: string): Promise<PantryItem> =>
      this.client.get(`/pantry/${id}`),

    create: (data: CreatePantryItem): Promise<PantryItem> =>
      this.client.post('/pantry', data),

    update: (id: string, data: UpdatePantryItem): Promise<PantryItem> =>
      this.client.patch(`/pantry/${id}`, data),

    delete: (id: string, reason?: 'used' | 'wasted'): Promise<void> =>
      this.client.delete(`/pantry/${id}`, reason ? { params: { reason } } : undefined),

    getStats: (): Promise<PantryStats> =>
      this.client.get('/pantry/stats'),

    scanBarcode: (data: BarcodeRecognition): Promise<RecognitionResult> =>
      this.client.post('/pantry/scan/barcode', data),

    recognizeImage: (data: ImageRecognition): Promise<RecognitionResult> =>
      this.client.post('/pantry/scan/image', data, {
        timeoutMs: GENERATION_TIMEOUT_MS,
      }),

    uploadImage: (file: Blob, context?: string): Promise<RecognitionResult> =>
      this.client.upload(
        '/pantry/scan/upload',
        file,
        'image',
        { context },
        { timeoutMs: GENERATION_TIMEOUT_MS }
      ),

    /** Read a receipt photo into items to review. Saves nothing. */
    readReceipt: (file: Blob): Promise<ReceiptResult> =>
      this.client.upload(
        '/pantry/scan/receipt',
        file,
        'image',
        {},
        { timeoutMs: GENERATION_TIMEOUT_MS }
      ),

    bulkUpdate: (items: Array<{ id: string; updates: UpdatePantryItem }>): Promise<PantryItem[]> =>
      this.client.patch('/pantry/bulk', { items }),

    exportData: (): Promise<{ downloadUrl: string }> =>
      this.client.get('/pantry/export'),
  };

  // Meal plan endpoints
  mealPlans = {
    search: (params?: MealPlanSearch): Promise<MealPlanSearchResponse> =>
      this.client.get('/meal-plans', { params }),

    getById: (id: string): Promise<MealPlan> =>
      this.client.get(`/meal-plans/${id}`),

    create: (data: CreateMealPlan): Promise<MealPlan> =>
      this.client.post('/meal-plans', data),

    update: (id: string, data: UpdateMealPlan): Promise<MealPlan> =>
      this.client.patch(`/meal-plans/${id}`, data),

    delete: (id: string): Promise<void> =>
      this.client.delete(`/meal-plans/${id}`),

    generate: (data: MealPlanGenerationRequest): Promise<MealPlan> =>
      this.client.post('/meal-plans/generate', data, {
        timeoutMs: GENERATION_TIMEOUT_MS,
      }),

    quickSuggestion: (data: QuickMealSuggestion): Promise<Recipe[]> =>
      this.client.post('/meal-plans/quick-suggestion', data, {
        timeoutMs: GENERATION_TIMEOUT_MS,
      }),

    duplicate: (id: string): Promise<MealPlan> =>
      this.client.post(`/meal-plans/${id}/duplicate`),

    saveAsTemplate: (id: string): Promise<MealPlan> =>
      this.client.post(`/meal-plans/${id}/template`),
  };

  // Shopping list endpoints
  shoppingLists = {
    search: (params?: ShoppingListSearch): Promise<ShoppingListSearchResponse> =>
      this.client.get('/shopping-lists', { params }),

    getById: (id: string): Promise<ShoppingList> =>
      this.client.get(`/shopping-lists/${id}`),

    create: (data: CreateShoppingList): Promise<ShoppingList> =>
      this.client.post('/shopping-lists', data),

    update: (id: string, data: UpdateShoppingList): Promise<ShoppingList> =>
      this.client.patch(`/shopping-lists/${id}`, data),

    delete: (id: string): Promise<void> =>
      this.client.delete(`/shopping-lists/${id}`),

    generateFromMealPlan: (data: GenerateShoppingList): Promise<ShoppingList> =>
      this.client.post('/shopping-lists/generate', data),

    /** Upsert: an item with an `id` is updated, one without is created. */
    updateItems: (id: string, data: BulkUpsertShoppingListItems): Promise<ShoppingList> =>
      this.client.patch(`/shopping-lists/${id}/items`, data),

    markComplete: (id: string): Promise<ShoppingList> =>
      this.client.post(`/shopping-lists/${id}/complete`),

    share: (id: string, emails: string[]): Promise<{ shareUrl: string }> =>
      this.client.post(`/shopping-lists/${id}/share`, { emails }),

    /** The file's contents, not a link: the API sends the file itself. */
    export: (id: string, format: 'json' | 'csv'): Promise<string> =>
      this.client.text(`/shopping-lists/${id}/export`, {
        params: { format },
      }),
  };

  // Chat endpoints
  chat = {
    getSessions: (params?: ChatSessionSearch): Promise<ChatSessionSearchResponse> =>
      this.client.get('/chat/sessions', { params }),

    getSession: (id: string): Promise<ChatSession> =>
      this.client.get(`/chat/sessions/${id}`),

    createSession: (data?: CreateChatSession): Promise<ChatSession> =>
      this.client.post('/chat/sessions', data),

    deleteSession: (id: string): Promise<void> =>
      this.client.delete(`/chat/sessions/${id}`),

    /** One reply, whole. The caller types it; Phase 6 will do so centrally. */
    sendMessage: <T = Record<string, unknown>>(
      data: ChatMessageRequest
    ): Promise<T> =>
      this.client.post('/chat/message', data, {
        timeoutMs: GENERATION_TIMEOUT_MS,
      }),

    /**
     * The SSE response, unread. Decoding the frames is the caller's job; the
     * client only guarantees the request was authenticated and accepted.
     */
    stream: (
      data: ChatMessageRequest,
      signal?: AbortSignal
    ): Promise<FetchResponseLike> =>
      this.client.raw('/chat/stream', {
        method: 'POST',
        body: data,
        headers: { Accept: 'text/event-stream' },
        signal,
      }),

    updateSessionTitle: (id: string, title: string): Promise<ChatSession> =>
      this.client.patch(`/chat/sessions/${id}`, { title }),

    clearHistory: (id: string): Promise<ChatSession> =>
      this.client.delete(`/chat/sessions/${id}/messages`),
  };

  // Subscription endpoints
  subscription = {
    getStatus: (): Promise<{ tier: string; expiresAt?: string; features: string[] }> =>
      this.client.get('/subscription/status'),

    upgrade: (tier?: string): Promise<{ checkoutUrl?: string }> =>
      this.client.post('/subscription/upgrade', tier ? { tier } : undefined),

    cancel: (): Promise<void> =>
      this.client.post('/subscription/cancel'),

    getUsage: (): Promise<{ 
      chatMessages: number; 
      recipeGenerations: number; 
      mealPlans: number; 
      limits: Record<string, number> 
    }> =>
      this.client.get('/subscription/usage'),
  };

  // Analytics endpoints (for internal use)
  analytics = {
    getUserStats: (): Promise<{
      totalRecipes: number;
      totalMealPlans: number;
      pantryItems: number;
      chatSessions: number;
      lastActivity: string;
    }> =>
      this.client.get('/analytics/user-stats'),

    getFeatureUsage: (): Promise<Record<string, number>> =>
      this.client.get('/analytics/feature-usage'),

    logWasteEvent: (data: LogWasteEvent): Promise<void> =>
      this.client.post('/analytics/waste-log', data),

    getWasteSummary: (): Promise<WasteSummary> =>
      this.client.get('/analytics/waste-summary'),

    logMealCompletion: (data: LogMealCompletion): Promise<void> =>
      this.client.post('/analytics/meal-completion', data),

    getTodayNutrition: (): Promise<TodayNutrition> =>
      this.client.get('/analytics/today-nutrition'),
  };
}
