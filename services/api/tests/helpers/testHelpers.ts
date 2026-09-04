import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

export async function cleanupDatabase() {
  // Delete in reverse order of dependencies
  await prisma.chatMessage.deleteMany();
  await prisma.chatSession.deleteMany();
  await prisma.shoppingListItem.deleteMany();
  await prisma.meal.deleteMany();
  await prisma.mealPlan.deleteMany();
  await prisma.ingredient.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.pantryItem.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

export async function createTestUser(userData: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  isPremium?: boolean;
}) {
  const passwordHash = await bcrypt.hash(userData.password, 10);
  
  return await prisma.user.create({
    data: {
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      passwordHash,
      isPremium: userData.isPremium || false,
    },
  });
}

export async function createTestRecipe(userId: string, recipeData?: Partial<any>) {
  return await prisma.recipe.create({
    data: {
      title: recipeData?.title || 'Test Recipe',
      description: recipeData?.description || 'A test recipe',
      instructions: recipeData?.instructions || ['Step 1', 'Step 2'],
      servings: recipeData?.servings || 4,
      prepTime: recipeData?.prepTime || 15,
      cookTime: recipeData?.cookTime || 30,
      difficulty: recipeData?.difficulty || 'MEDIUM',
      cuisine: recipeData?.cuisine || 'American',
      userId,
      ingredients: {
        create: recipeData?.ingredients || [
          {
            name: 'Test Ingredient 1',
            amount: 1,
            unit: 'cup',
            category: 'produce',
          },
          {
            name: 'Test Ingredient 2',
            amount: 2,
            unit: 'tbsp',
            category: 'pantry_staples',
          },
        ],
      },
      ...recipeData,
    },
    include: {
      ingredients: true,
    },
  });
}

export async function createTestPantryItem(userId: string, itemData?: Partial<any>) {
  return await prisma.pantryItem.create({
    data: {
      name: itemData?.name || 'Test Item',
      quantity: itemData?.quantity || 1,
      unit: itemData?.unit || 'piece',
      category: itemData?.category || 'other',
      location: itemData?.location || 'pantry',
      expirationDate: itemData?.expirationDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isLowStock: itemData?.isLowStock || false,
      lowStockThreshold: itemData?.lowStockThreshold || 1,
      userId,
      ...itemData,
    },
  });
}

export async function createTestMealPlan(userId: string, mealPlanData?: Partial<any>) {
  return await prisma.mealPlan.create({
    data: {
      title: mealPlanData?.title || 'Test Meal Plan',
      description: mealPlanData?.description || 'A test meal plan',
      startDate: mealPlanData?.startDate || new Date(),
      endDate: mealPlanData?.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      userId,
      meals: {
        create: mealPlanData?.meals || [
          {
            date: new Date(),
            mealType: 'BREAKFAST',
            recipeName: 'Test Breakfast',
            servings: 2,
          },
          {
            date: new Date(),
            mealType: 'LUNCH',
            recipeName: 'Test Lunch',
            servings: 2,
          },
        ],
      },
      ...mealPlanData,
    },
    include: {
      meals: true,
    },
  });
}

export async function createTestChatSession(userId: string, sessionData?: Partial<any>) {
  return await prisma.chatSession.create({
    data: {
      title: sessionData?.title || 'Test Chat Session',
      isActive: sessionData?.isActive !== undefined ? sessionData.isActive : true,
      context: sessionData?.context || {},
      userId,
      messages: {
        create: sessionData?.messages || [
          {
            role: 'USER',
            content: 'Hello, test message',
            timestamp: new Date(),
          },
          {
            role: 'ASSISTANT',
            content: 'Hello! How can I help you with cooking today?',
            timestamp: new Date(),
          },
        ],
      },
      ...sessionData,
    },
    include: {
      messages: true,
    },
  });
}

export function createAuthHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function loginTestUser(email: string, password: string) {
  // This would typically make a request to the login endpoint
  // For now, we'll return a mock token
  return {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
  };
}

export function expectValidationError(response: any, field?: string) {
  expect(response.body).toMatchObject({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
    },
  });

  if (field) {
    expect(response.body.error.details).toContain(field);
  }
}

export function expectAuthenticationError(response: any) {
  expect(response.body).toMatchObject({
    success: false,
    error: {
      code: expect.stringMatching(/AUTHENTICATION|UNAUTHORIZED|INVALID_TOKEN/),
    },
  });
}

export function expectNotFoundError(response: any, resource?: string) {
  expect(response.body).toMatchObject({
    success: false,
    error: {
      code: 'NOT_FOUND',
    },
  });

  if (resource) {
    expect(response.body.error.message).toContain(resource);
  }
}
