import { prisma } from '../database';
import { logger } from '../utils/logger';
import { Difficulty } from '@prisma/client';
import type { SaveGeneratedRecipeRequest } from '@petra/agent-contract';

export interface RecipeFilters {
  query?: string;
  cuisine?: string;
  difficulty?: Difficulty;
  dietaryTags?: string[];
  maxPrepTime?: number;
  maxCookTime?: number;
  isAIGenerated?: boolean;
  isPublic?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export class RecipeService {
  async search(filters: RecipeFilters, userId?: string) {
    const {
      query,
      cuisine,
      difficulty,
      dietaryTags,
      maxPrepTime,
      maxCookTime,
      isAIGenerated,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 20,
    } = filters;

    const offset = (page - 1) * limit;
    const where: any = { isPublic: true };

    if (query) {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (cuisine) where.cuisine = { equals: cuisine, mode: 'insensitive' };
    if (difficulty) where.difficulty = difficulty;
    if (dietaryTags?.length) where.dietaryTags = { hasEvery: dietaryTags };
    if (maxPrepTime) where.prepTime = { lte: maxPrepTime };
    if (maxCookTime) where.cookTime = { lte: maxCookTime };
    if (isAIGenerated !== undefined) where.isAIGenerated = isAIGenerated;

    try {
      const [recipes, total] = await Promise.all([
        prisma.recipe.findMany({
          where,
          include: {
            ingredients: { orderBy: { order: 'asc' } },
            instructions: { orderBy: { step: 'asc' } },
            nutrition: true,
            favorites: userId ? { where: { userId } } : false,
          },
          orderBy: { [sortBy]: sortOrder },
          skip: offset,
          take: limit,
        }),
        prisma.recipe.count({ where }),
      ]);

      return {
        recipes: recipes.map(r => ({
          ...r,
          isFavorited: userId ? r.favorites.length > 0 : false,
          favorites: undefined,
        })),
        total,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: offset + recipes.length < total,
        },
      };
    } catch (error) {
      logger.error('Failed to search recipes:', error);
      throw error;
    }
  }

  async getById(id: string, userId?: string) {
    try {
      const recipe = await prisma.recipe.findUnique({
        where: { id },
        include: {
          ingredients: { orderBy: { order: 'asc' } },
          instructions: { orderBy: { step: 'asc' } },
          nutrition: true,
          favorites: userId ? { where: { userId } } : false,
          ratings: userId ? { where: { userId } } : false,
        },
      });

      if (!recipe) return null;

      return {
        ...recipe,
        isFavorited: userId ? recipe.favorites.length > 0 : false,
        userRating: userId && recipe.ratings.length > 0 ? recipe.ratings[0].rating : null,
        favorites: undefined,
        ratings: undefined,
      };
    } catch (error) {
      logger.error('Failed to get recipe:', error);
      throw error;
    }
  }

  async create(data: any) {
    const { ingredients, instructions, nutrition, ...recipeData } = data;

    try {
      return await prisma.recipe.create({
        data: {
          ...recipeData,
          totalTime: (recipeData.prepTime || 0) + (recipeData.cookTime || 0),
          ingredients: ingredients?.length
            ? { create: ingredients }
            : undefined,
          instructions: instructions?.length
            ? { create: instructions }
            : undefined,
          nutrition: nutrition ? { create: nutrition } : undefined,
        },
        include: {
          ingredients: { orderBy: { order: 'asc' } },
          instructions: { orderBy: { step: 'asc' } },
          nutrition: true,
        },
      });
    } catch (error) {
      logger.error('Failed to create recipe:', error);
      throw error;
    }
  }

  /**
   * Persist a recipe the agent composed, with the macros it computed.
   *
   * The agent returns validated fields and writes nothing — the same division
   * as enrichment, and for the same reason: the API owns the `recipes` table
   * and every migration against it. By the time a payload reaches here it has
   * already been through the agent's validator (every ingredient inside the
   * allowed set, no blocked term, steps that reference what they use) and
   * through `saveGeneratedRecipeRequestSchema` at the route. This function's
   * job is the write, not the judgement.
   *
   * Saved private and attributed to the user. A generation is a dish written
   * for one person's kitchen out of one person's ingredients; publishing it to
   * the shared corpus by default would fill the library with near-duplicates
   * nobody chose to share.
   *
   * `isAIGenerated` and the `generated:` source prefix are what make these
   * separable later — from analytics, from an export, or from a decision to
   * stop trusting a model's output.
   */
  async createFromGeneration(
    userId: string,
    recipe: SaveGeneratedRecipeRequest['recipe'],
    nutrition?: SaveGeneratedRecipeRequest['nutrition']
  ) {
    const prepTime = recipe.prepTime ?? 0;
    const cookTime = recipe.cookTime ?? 0;

    return prisma.recipe.create({
      data: {
        title: recipe.title,
        description: recipe.description ?? null,
        imageUrl: null,
        servings: recipe.servings,
        prepTime,
        cookTime,
        totalTime: prepTime + cookTime,
        difficulty: recipe.difficulty as Difficulty,
        cuisine: recipe.cuisine ?? null,
        mealCategory: null,
        dietaryTags: [],
        createdById: userId,
        isAIGenerated: true,
        // Records which library recipes seeded it, when it came from the merge
        // path. Enough to answer "where did this come from" without a table.
        source: `generated:${recipe.inspiredBy.join(',') || 'scratch'}`,
        isPublic: false,
        safetyNote: recipe.safetyNote ?? null,
        zeroWasteNote: recipe.zeroWasteNote ?? null,
        ingredients: {
          create: recipe.ingredients.map((i, index) => ({
            name: i.name,
            amount: i.amount,
            unit: i.unit,
            notes: i.notes ?? null,
            order: index + 1,
          })),
        },
        instructions: {
          create: recipe.instructions.map((s, index) => ({
            step: index + 1,
            instruction: s.instruction,
            duration: s.duration ?? null,
            tip: s.tip ?? null,
          })),
        },
        // Carried across rather than re-estimated. These came from a nutrition
        // database and deterministic arithmetic; asking a model for them again
        // at save time would replace a checkable number with a plausible one.
        ...(nutrition
          ? {
              nutrition: {
                create: {
                  calories: nutrition.perServing.calories,
                  protein: nutrition.perServing.protein,
                  carbs: nutrition.perServing.carbs,
                  fat: nutrition.perServing.fat,
                  fiber: nutrition.perServing.fiber ?? null,
                  sugar: nutrition.perServing.sugar ?? null,
                  sodium: nutrition.perServing.sodium ?? null,
                },
              },
            }
          : {}),
      },
      include: {
        ingredients: { orderBy: { order: 'asc' } },
        instructions: { orderBy: { step: 'asc' } },
        nutrition: true,
      },
    });
  }

  async update(id: string, userId: string, data: any) {
    const { ingredients, instructions, nutrition, ...recipeData } = data;

    try {
      const existing = await prisma.recipe.findFirst({
        where: { id, createdById: userId },
      });

      if (!existing) return null;

      if (recipeData.prepTime !== undefined || recipeData.cookTime !== undefined) {
        const prep = recipeData.prepTime ?? existing.prepTime;
        const cook = recipeData.cookTime ?? existing.cookTime;
        recipeData.totalTime = prep + cook;
      }

      return await prisma.recipe.update({
        where: { id },
        data: recipeData,
        include: {
          ingredients: { orderBy: { order: 'asc' } },
          instructions: { orderBy: { step: 'asc' } },
          nutrition: true,
        },
      });
    } catch (error) {
      logger.error('Failed to update recipe:', error);
      throw error;
    }
  }

  async delete(id: string, userId: string) {
    try {
      const existing = await prisma.recipe.findFirst({
        where: { id, createdById: userId },
      });

      if (!existing) return null;

      await prisma.recipe.delete({ where: { id } });
      return true;
    } catch (error) {
      logger.error('Failed to delete recipe:', error);
      throw error;
    }
  }

  async addFavorite(recipeId: string, userId: string) {
    try {
      await prisma.userFavorite.upsert({
        where: { userId_recipeId: { userId, recipeId } },
        create: { userId, recipeId },
        update: {},
      });
      return true;
    } catch (error) {
      logger.error('Failed to add favorite:', error);
      throw error;
    }
  }

  async removeFavorite(recipeId: string, userId: string) {
    try {
      await prisma.userFavorite.deleteMany({ where: { userId, recipeId } });
      return true;
    } catch (error) {
      logger.error('Failed to remove favorite:', error);
      throw error;
    }
  }

  async getFavorites(userId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    try {
      const [favorites, total] = await Promise.all([
        prisma.userFavorite.findMany({
          where: { userId },
          include: {
            recipe: {
              include: {
                ingredients: { orderBy: { order: 'asc' } },
                instructions: { orderBy: { step: 'asc' } },
                nutrition: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
        }),
        prisma.userFavorite.count({ where: { userId } }),
      ]);

      return {
        recipes: favorites.map(f => ({ ...f.recipe, isFavorited: true })),
        total,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: offset + favorites.length < total,
        },
      };
    } catch (error) {
      logger.error('Failed to get favorites:', error);
      throw error;
    }
  }

  async rateRecipe(recipeId: string, userId: string, rating: number, review?: string) {
    try {
      const existing = await prisma.recipe.findUnique({ where: { id: recipeId } });
      if (!existing) return null;

      await prisma.userRating.upsert({
        where: { userId_recipeId: { userId, recipeId } },
        create: { userId, recipeId, rating, review },
        update: { rating, review },
      });

      // Recalculate average rating
      const result = await prisma.userRating.aggregate({
        where: { recipeId },
        _avg: { rating: true },
        _count: { rating: true },
      });

      await prisma.recipe.update({
        where: { id: recipeId },
        data: {
          rating: result._avg.rating ?? 0,
          reviewCount: result._count.rating,
        },
      });

      return true;
    } catch (error) {
      logger.error('Failed to rate recipe:', error);
      throw error;
    }
  }

  async getMyRecipes(userId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    try {
      const [recipes, total] = await Promise.all([
        prisma.recipe.findMany({
          where: { createdById: userId },
          include: {
            ingredients: { orderBy: { order: 'asc' } },
            instructions: { orderBy: { step: 'asc' } },
            nutrition: true,
          },
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
        }),
        prisma.recipe.count({ where: { createdById: userId } }),
      ]);

      return {
        recipes,
        total,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: offset + recipes.length < total,
        },
      };
    } catch (error) {
      logger.error('Failed to get user recipes:', error);
      throw error;
    }
  }
}
