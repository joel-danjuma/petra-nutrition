/**
 * The shapes the chat path passes around.
 *
 * Split out of `groq.ts` so that the prompt builder, the response parser and
 * the graph's respond node can share them without any of those three depending
 * on a provider client. `ChatResponse` here is the agent's internal shape; the
 * wire shape is `chatResponseSchema` in @petra/agent-contract, and the two are
 * kept aligned by the route handlers parsing against the contract.
 */

import type { GeneratedRecipe, NutritionBreakdown } from '@petra/agent-contract';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatContext {
  userPreferences?: any;
  currentPantryItems?: string[];
  activeMealPlan?: string;
  lastRecipeSearch?: string;
  dietaryRestrictions?: string[];
  healthGoals?: string[];
  allergies?: string[];
  /** Recipes retrieved from the library for this turn — see RetrievalService. */
  retrievedRecipes?: RetrievedRecipeContext[];
}

export interface RetrievedRecipeContext {
  id: string;
  title: string;
  cuisine?: string | null;
  totalTime?: number;
  matched: string[];
  missing: string[];
}

export interface ChatResponse {
  content: string;
  type: 'text' | 'recipe_suggestion' | 'meal_plan_suggestion' | 'pantry_update' | 'shopping_list_generation';
  structuredData?: any;
  suggestions?: string[];
  /** Set when the reply recommends a real recipe from the library. Drives the
   *  tappable recipe card in the chat stream. */
  recipeId?: string;
  confidence?: number;
  /** Which model actually served the turn, and what it cost. Observability
   *  only — the gateway logs these, no client renders them. */
  model?: string;
  tokensUsed?: number;

  /* --- the graph's additions. Optional here so the single-shot endpoints that
     never touch the graph stay unchanged. ---------------------------------- */

  /** A dish the agent composed rather than found. No `recipeId` to open. */
  generatedRecipe?: GeneratedRecipe;
  /** Macros for the portion suggested, with per-ingredient provenance. */
  nutrition?: NutritionBreakdown;
  /** Decisions taken on the user's behalf, stated rather than hidden. */
  assumptions?: string[];
  /** Constraints that could not be fully met, named plainly. */
  compromises?: string[];
}
