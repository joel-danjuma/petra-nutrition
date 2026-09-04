import { PrismaClient, Difficulty, ItemCategory, StorageLocation, MealType, Priority } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { seedDemoAccount } from './seed-demo';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Users
  const passwordHash = await bcrypt.hash('password123', 10);

  const alice = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Johnson',
      passwordHash,
      isEmailVerified: true,
      subscriptionTier: 'PREMIUM',
      profile: {
        create: {
          age: 30,
          height: 165,
          weight: 60,
          activityLevel: 'MODERATELY_ACTIVE',
          dietaryRestrictions: ['Gluten-Free'],
          healthGoals: ['MAINTENANCE'],
          cuisinePreferences: ['Italian', 'Mediterranean'],
        },
      },
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      email: 'bob@example.com',
      firstName: 'Bob',
      lastName: 'Smith',
      passwordHash,
      isEmailVerified: true,
      subscriptionTier: 'FREE',
      profile: {
        create: {
          age: 25,
          height: 180,
          weight: 80,
          activityLevel: 'VERY_ACTIVE',
          healthGoals: ['MUSCLE_GAIN'],
          cuisinePreferences: ['Asian', 'Mexican'],
        },
      },
    },
  });

  console.log(`Created users: ${alice.email}, ${bob.email}`);

  // Recipes
  const pastaRecipe = await prisma.recipe.upsert({
    where: { id: '11111111-1111-4111-8111-111111111001' },
    update: {},
    create: {
      id: '11111111-1111-4111-8111-111111111001',
      title: 'Classic Spaghetti Carbonara',
      description: 'A rich and creamy Italian pasta dish made with eggs, cheese, pancetta, and black pepper.',
      servings: 4,
      prepTime: 10,
      cookTime: 20,
      totalTime: 30,
      difficulty: Difficulty.MEDIUM,
      cuisine: 'Italian',
      dietaryTags: [],
      rating: 4.5,
      reviewCount: 1,
      isPublic: true,
      createdById: alice.id,
      ingredients: {
        create: [
          { name: 'Spaghetti', amount: 400, unit: 'g', order: 1 },
          { name: 'Pancetta', amount: 150, unit: 'g', order: 2 },
          { name: 'Eggs', amount: 4, unit: 'whole', order: 3 },
          { name: 'Parmesan cheese', amount: 100, unit: 'g', order: 4 },
          { name: 'Black pepper', amount: 2, unit: 'tsp', order: 5 },
          { name: 'Salt', amount: 1, unit: 'tsp', order: 6 },
        ],
      },
      instructions: {
        create: [
          { step: 1, instruction: 'Bring a large pot of salted water to a boil and cook spaghetti until al dente.', duration: 10 },
          { step: 2, instruction: 'Fry pancetta in a large pan over medium heat until crispy.', duration: 5 },
          { step: 3, instruction: 'Whisk eggs and grated Parmesan together in a bowl. Season generously with black pepper.' },
          { step: 4, instruction: 'Reserve 1 cup of pasta water, then drain the spaghetti.' },
          { step: 5, instruction: 'Remove pan from heat. Add spaghetti to pancetta and toss. Add egg mixture and pasta water gradually, tossing quickly to create a creamy sauce.', duration: 3 },
          { step: 6, instruction: 'Serve immediately with extra Parmesan and black pepper.' },
        ],
      },
      nutrition: {
        create: {
          calories: 620,
          protein: 28,
          carbs: 72,
          fat: 24,
          fiber: 3,
          sodium: 780,
        },
      },
    },
  });

  const saladRecipe = await prisma.recipe.upsert({
    where: { id: '11111111-1111-4111-8111-111111111002' },
    update: {},
    create: {
      id: '11111111-1111-4111-8111-111111111002',
      title: 'Grilled Chicken Caesar Salad',
      description: 'A classic Caesar salad topped with juicy grilled chicken breast.',
      servings: 2,
      prepTime: 15,
      cookTime: 15,
      totalTime: 30,
      difficulty: Difficulty.EASY,
      cuisine: 'American',
      dietaryTags: ['High-Protein'],
      rating: 4.2,
      reviewCount: 1,
      isPublic: true,
      createdById: alice.id,
      ingredients: {
        create: [
          { name: 'Chicken breast', amount: 2, unit: 'pieces', order: 1 },
          { name: 'Romaine lettuce', amount: 1, unit: 'head', order: 2 },
          { name: 'Caesar dressing', amount: 4, unit: 'tbsp', order: 3 },
          { name: 'Parmesan cheese', amount: 30, unit: 'g', order: 4 },
          { name: 'Croutons', amount: 50, unit: 'g', order: 5 },
          { name: 'Lemon juice', amount: 1, unit: 'tbsp', order: 6 },
        ],
      },
      instructions: {
        create: [
          { step: 1, instruction: 'Season chicken breasts with salt, pepper, and a drizzle of olive oil.' },
          { step: 2, instruction: 'Grill chicken over medium-high heat for 6-7 minutes per side until cooked through.', duration: 14 },
          { step: 3, instruction: 'Let chicken rest for 5 minutes, then slice.' },
          { step: 4, instruction: 'Toss romaine lettuce with Caesar dressing and lemon juice.' },
          { step: 5, instruction: 'Top salad with sliced chicken, croutons, and Parmesan.' },
        ],
      },
      nutrition: {
        create: {
          calories: 380,
          protein: 45,
          carbs: 14,
          fat: 16,
          fiber: 3,
          sodium: 620,
        },
      },
    },
  });

  const smoothieRecipe = await prisma.recipe.upsert({
    where: { id: '11111111-1111-4111-8111-111111111003' },
    update: {},
    create: {
      id: '11111111-1111-4111-8111-111111111003',
      title: 'Berry Protein Smoothie',
      description: 'A quick and nutritious breakfast smoothie packed with antioxidants and protein.',
      servings: 1,
      prepTime: 5,
      cookTime: 0,
      totalTime: 5,
      difficulty: Difficulty.EASY,
      cuisine: 'American',
      dietaryTags: ['Vegetarian', 'Gluten-Free', 'High-Protein'],
      isPublic: true,
      ingredients: {
        create: [
          { name: 'Mixed berries (frozen)', amount: 200, unit: 'g', order: 1 },
          { name: 'Banana', amount: 1, unit: 'whole', order: 2 },
          { name: 'Greek yogurt', amount: 150, unit: 'g', order: 3 },
          { name: 'Almond milk', amount: 200, unit: 'ml', order: 4 },
          { name: 'Protein powder', amount: 1, unit: 'scoop', order: 5, notes: 'Optional' },
          { name: 'Honey', amount: 1, unit: 'tsp', order: 6, notes: 'Optional' },
        ],
      },
      instructions: {
        create: [
          { step: 1, instruction: 'Add all ingredients to a blender.' },
          { step: 2, instruction: 'Blend on high for 60 seconds until smooth.', duration: 1 },
          { step: 3, instruction: 'Pour into a glass and serve immediately.' },
        ],
      },
      nutrition: {
        create: {
          calories: 310,
          protein: 22,
          carbs: 48,
          fat: 4,
          fiber: 6,
          sugar: 32,
        },
      },
    },
  });

  console.log(`Created recipes: ${pastaRecipe.title}, ${saladRecipe.title}, ${smoothieRecipe.title}`);

  // Clear Alice's owned rows before rebuilding: these three sections use
  // create/createMany and duplicated on every re-run.
  await prisma.$transaction([
    prisma.pantryItem.deleteMany({ where: { userId: alice.id } }),
    prisma.shoppingList.deleteMany({ where: { userId: alice.id } }),
    prisma.mealPlan.deleteMany({ where: { userId: alice.id } }),
  ]);

  // Pantry items for Alice
  await prisma.pantryItem.createMany({
    skipDuplicates: true,
    data: [
      { userId: alice.id, name: 'Spaghetti', category: ItemCategory.GRAINS, quantity: 500, unit: 'g', location: StorageLocation.PANTRY },
      { userId: alice.id, name: 'Olive Oil', category: ItemCategory.CONDIMENTS, quantity: 750, unit: 'ml', location: StorageLocation.PANTRY },
      { userId: alice.id, name: 'Parmesan Cheese', category: ItemCategory.DAIRY, quantity: 200, unit: 'g', location: StorageLocation.FRIDGE },
      { userId: alice.id, name: 'Eggs', category: ItemCategory.DAIRY, quantity: 12, unit: 'whole', location: StorageLocation.FRIDGE },
      { userId: alice.id, name: 'Chicken Breast', category: ItemCategory.MEAT, quantity: 600, unit: 'g', location: StorageLocation.FREEZER },
      { userId: alice.id, name: 'Romaine Lettuce', category: ItemCategory.PRODUCE, quantity: 1, unit: 'head', location: StorageLocation.FRIDGE },
      { userId: alice.id, name: 'Mixed Berries', category: ItemCategory.FROZEN, quantity: 500, unit: 'g', location: StorageLocation.FREEZER },
      { userId: alice.id, name: 'Greek Yogurt', category: ItemCategory.DAIRY, quantity: 500, unit: 'g', location: StorageLocation.FRIDGE },
      { userId: alice.id, name: 'Almond Milk', category: ItemCategory.BEVERAGES, quantity: 1000, unit: 'ml', location: StorageLocation.FRIDGE },
      { userId: alice.id, name: 'Black Pepper', category: ItemCategory.SPICES, quantity: 50, unit: 'g', location: StorageLocation.PANTRY },
    ],
  });

  console.log('Created pantry items for Alice');

  // Meal plan for Alice
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 2);

  const tomorrow = new Date(startDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(startDate);
  dayAfter.setDate(dayAfter.getDate() + 2);

  const mealPlan = await prisma.mealPlan.create({
    data: {
      userId: alice.id,
      name: 'This Week\'s Meal Plan',
      description: 'A balanced 3-day meal plan',
      startDate,
      endDate,
      meals: {
        create: [
          { date: startDate, mealType: MealType.BREAKFAST, recipeId: smoothieRecipe.id, servings: 1 },
          { date: startDate, mealType: MealType.DINNER, recipeId: pastaRecipe.id, servings: 2 },
          { date: tomorrow, mealType: MealType.LUNCH, recipeId: saladRecipe.id, servings: 1 },
          { date: tomorrow, mealType: MealType.DINNER, recipeId: pastaRecipe.id, servings: 2 },
          { date: dayAfter, mealType: MealType.BREAKFAST, recipeId: smoothieRecipe.id, servings: 1 },
          { date: dayAfter, mealType: MealType.LUNCH, recipeId: saladRecipe.id, servings: 1 },
        ],
      },
    },
  });

  console.log(`Created meal plan: ${mealPlan.name}`);

  // Shopping list for Alice
  const shoppingList = await prisma.shoppingList.create({
    data: {
      userId: alice.id,
      name: 'Weekly Groceries',
      items: {
        create: [
          { name: 'Pancetta', quantity: 150, unit: 'g', category: ItemCategory.MEAT, priority: Priority.HIGH },
          { name: 'Bananas', quantity: 6, unit: 'whole', category: ItemCategory.PRODUCE, priority: Priority.MEDIUM },
          { name: 'Honey', quantity: 1, unit: 'jar', category: ItemCategory.PANTRY_STAPLES, priority: Priority.LOW },
          { name: 'Caesar Dressing', quantity: 1, unit: 'bottle', category: ItemCategory.CONDIMENTS, priority: Priority.HIGH },
          { name: 'Croutons', quantity: 200, unit: 'g', category: ItemCategory.SNACKS, priority: Priority.MEDIUM },
          { name: 'Lemon', quantity: 3, unit: 'whole', category: ItemCategory.PRODUCE, priority: Priority.MEDIUM },
        ],
      },
    },
  });

  console.log(`Created shopping list: ${shoppingList.name}`);

  // Favorite for Bob
  await prisma.userFavorite.upsert({
    where: { userId_recipeId: { userId: bob.id, recipeId: pastaRecipe.id } },
    update: {},
    create: { userId: bob.id, recipeId: pastaRecipe.id },
  });

  // Rating from Alice
  await prisma.userRating.upsert({
    where: { userId_recipeId: { userId: alice.id, recipeId: pastaRecipe.id } },
    update: {},
    create: { userId: alice.id, recipeId: pastaRecipe.id, rating: 5, review: 'Absolutely delicious! My family loved it.' },
  });

  // The rich premium demo account. Depends on the imported recipe library, so
  // it degrades with a warning rather than failing if that hasn't been run.
  console.log('\nSeeding demo account...');
  await seedDemoAccount(prisma);

  console.log('\nSeed complete.');
  console.log('\nTest credentials:');
  console.log('  demo@petra.app    / password123  (Premium, full demo data)');
  console.log('  alice@example.com / password123  (Premium)');
  console.log('  bob@example.com   / password123  (Free)');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
