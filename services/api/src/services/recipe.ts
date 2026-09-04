import { prisma } from '../database';
import { logger } from '../utils/logger';
import { Difficulty } from '@prisma/client';

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
