import {
  ItemCategory,
  MealType,
  PrismaClient,
  Priority,
  StorageLocation,
  WasteAction,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * The premium demo account — `demo@petra.app` / `password123`.
 *
 * Exists because every analytics and onboarding surface in the app reads from
 * data the original seed never created: no meal completions, no waste logs, no
 * chat history, and a profile with `onboardingCompletedAt`, `cookingSkill` and
 * every daily target left null. On that data the app is technically working and
 * visibly empty.
 *
 * Idempotent by construction: the account's owned rows are deleted and rebuilt
 * on every run. The original seed's pantry/meal-plan/shopping-list sections used
 * bare `create`/`createMany` and silently duplicated on each re-run.
 *
 * It leans on the imported recipe library, so run this AFTER:
 *   db:import-recipes  →  db:enrich-recipes
 */

const DEMO_EMAIL = 'demo@petra.app';

/** `@db.Date` columns compare by calendar day; normalise away the time. */
function day(offsetDays: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** A timestamp offset in days, keeping the time-of-day for realism. */
function at(offsetDays: number, hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, 0, 0, 0);
  return d;
}

interface PantrySpec {
  name: string;
  category: ItemCategory;
  quantity: number;
  unit: string;
  location: StorageLocation;
  /** Days from today. Negative = already past. Undefined = no expiry. */
  expiresIn?: number;
  isLowStock?: boolean;
  brand?: string;
}

/**
 * Deliberately shaped so the app's conditional surfaces actually light up:
 * three items inside 48h drive Today's "needs using" callout and the pantry's
 * urgent badges; two low-stock items drive the "running low" count.
 */
const PANTRY: PantrySpec[] = [
  // Turning now — these are what Today surfaces.
  { name: 'Cilantro', category: 'PRODUCE', quantity: 1, unit: 'bunch', location: 'FRIDGE', expiresIn: 1 },
  { name: 'Broccoli', category: 'PRODUCE', quantity: 1, unit: 'head', location: 'FRIDGE', expiresIn: 2 },
  { name: 'Greek Yogurt', category: 'DAIRY', quantity: 400, unit: 'g', location: 'FRIDGE', expiresIn: 2, brand: 'Fage' },

  // This week
  { name: 'Chicken Thighs', category: 'MEAT', quantity: 900, unit: 'g', location: 'FRIDGE', expiresIn: 3 },
  { name: 'Spinach', category: 'PRODUCE', quantity: 200, unit: 'g', location: 'FRIDGE', expiresIn: 4 },
  { name: 'Feta', category: 'DAIRY', quantity: 200, unit: 'g', location: 'FRIDGE', expiresIn: 6 },
  { name: 'Eggs', category: 'DAIRY', quantity: 10, unit: 'whole', location: 'FRIDGE', expiresIn: 9 },
  { name: 'Lemons', category: 'PRODUCE', quantity: 4, unit: 'whole', location: 'FRIDGE', expiresIn: 9 },
  { name: 'Carrots', category: 'PRODUCE', quantity: 500, unit: 'g', location: 'FRIDGE', expiresIn: 11 },
  { name: 'Parmesan', category: 'DAIRY', quantity: 180, unit: 'g', location: 'FRIDGE', expiresIn: 21 },
  { name: 'Whole Milk', category: 'DAIRY', quantity: 1000, unit: 'ml', location: 'FRIDGE', expiresIn: 5 },
  { name: 'Salmon Fillets', category: 'SEAFOOD', quantity: 2, unit: 'fillets', location: 'FRIDGE', expiresIn: 2 },

  // Freezer
  { name: 'Frozen Peas', category: 'FROZEN', quantity: 600, unit: 'g', location: 'FREEZER' },
  { name: 'Puff Pastry', category: 'FROZEN', quantity: 320, unit: 'g', location: 'FREEZER' },
  { name: 'Mixed Berries', category: 'FROZEN', quantity: 500, unit: 'g', location: 'FREEZER' },

  // Staples
  { name: 'Olive Oil', category: 'CONDIMENTS', quantity: 100, unit: 'ml', location: 'PANTRY', isLowStock: true },
  { name: 'Bulgur Wheat', category: 'GRAINS', quantity: 80, unit: 'g', location: 'PANTRY', isLowStock: true },
  { name: 'Basmati Rice', category: 'GRAINS', quantity: 1000, unit: 'g', location: 'PANTRY' },
  { name: 'Spaghetti', category: 'GRAINS', quantity: 500, unit: 'g', location: 'PANTRY' },
  { name: 'Red Lentils', category: 'GRAINS', quantity: 500, unit: 'g', location: 'PANTRY' },
  { name: 'Harissa Paste', category: 'CONDIMENTS', quantity: 1, unit: 'jar', location: 'PANTRY', expiresIn: 120 },
  { name: 'Tahini', category: 'CONDIMENTS', quantity: 1, unit: 'jar', location: 'PANTRY', expiresIn: 200 },
  { name: 'Soy Sauce', category: 'CONDIMENTS', quantity: 250, unit: 'ml', location: 'PANTRY' },
  { name: 'Chopped Tomatoes', category: 'CANNED', quantity: 4, unit: 'tins', location: 'PANTRY' },
  { name: 'Chickpeas', category: 'CANNED', quantity: 2, unit: 'tins', location: 'PANTRY' },
  { name: 'Cumin', category: 'SPICES', quantity: 45, unit: 'g', location: 'PANTRY' },
  { name: 'Smoked Paprika', category: 'SPICES', quantity: 50, unit: 'g', location: 'PANTRY' },
  { name: 'Black Pepper', category: 'SPICES', quantity: 60, unit: 'g', location: 'PANTRY' },
];

/** Mostly used, with waste clustered in PRODUCE so `weakSpotCategory` resolves. */
const WASTE_SEED: { name: string; category: ItemCategory; action: WasteAction; qty: number; unit: string; daysAgo: number }[] = [
  ...['Chicken Thighs', 'Broccoli', 'Bulgur Wheat', 'Feta', 'Lemons', 'Spinach', 'Carrots', 'Basmati Rice',
      'Chickpeas', 'Salmon Fillets', 'Eggs', 'Parmesan', 'Frozen Peas', 'Red Lentils', 'Harissa Paste',
      'Greek Yogurt', 'Spaghetti', 'Chopped Tomatoes', 'Olive Oil', 'Cumin', 'Whole Milk', 'Tahini',
      'Puff Pastry', 'Mixed Berries', 'Soy Sauce', 'Smoked Paprika', 'Black Pepper', 'Cilantro',
      'Basmati Rice', 'Chicken Thighs', 'Spinach', 'Feta']
    .map((name, i) => ({
      name,
      category: 'OTHER' as ItemCategory,
      action: WasteAction.USED,
      qty: 100 + (i % 5) * 50,
      unit: 'g',
      // Spread across the last fortnight rather than one-per-day going back a
      // month: "kg saved this month" is a calendar-month figure, so pushing
      // history far back left the Today tile reading near-zero early in a month.
      daysAgo: 1 + (i % 13),
    })),
  // The weak spot: fresh herbs and leaves, which is what the profile card calls out.
  { name: 'Parsley', category: 'PRODUCE', action: WasteAction.WASTED, qty: 30, unit: 'g', daysAgo: 4 },
  { name: 'Cilantro', category: 'PRODUCE', action: WasteAction.WASTED, qty: 25, unit: 'g', daysAgo: 9 },
  { name: 'Basil', category: 'PRODUCE', action: WasteAction.WASTED, qty: 20, unit: 'g', daysAgo: 14 },
  { name: 'Spinach', category: 'PRODUCE', action: WasteAction.WASTED, qty: 80, unit: 'g', daysAgo: 18 },
  { name: 'Rocket', category: 'PRODUCE', action: WasteAction.WASTED, qty: 60, unit: 'g', daysAgo: 23 },
  { name: 'Mint', category: 'PRODUCE', action: WasteAction.WASTED, qty: 15, unit: 'g', daysAgo: 27 },
  { name: 'Sourdough', category: 'GRAINS', action: WasteAction.WASTED, qty: 200, unit: 'g', daysAgo: 12 },
  { name: 'Whole Milk', category: 'DAIRY', action: WasteAction.WASTED, qty: 300, unit: 'ml', daysAgo: 20 },
];

export async function seedDemoAccount(prisma: PrismaClient) {
  const passwordHash = await bcrypt.hash('password123', 10);

  const demo = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { subscriptionTier: 'PREMIUM' },
    create: {
      email: DEMO_EMAIL,
      firstName: 'Joel',
      lastName: 'Danjuma',
      passwordHash,
      isEmailVerified: true,
      subscriptionTier: 'PREMIUM',
    },
  });

  // A complete profile. The originals left onboarding and every daily target
  // null, which sends the app down its "not onboarded" and default-target paths.
  await prisma.userProfile.upsert({
    where: { userId: demo.id },
    create: {
      userId: demo.id,
      age: 34,
      height: 178,
      weight: 76,
      activityLevel: 'MODERATELY_ACTIVE',
      dietaryRestrictions: ['Gluten-free', 'No shellfish'],
      allergies: ['Shellfish'],
      healthGoals: ['MAINTENANCE', 'HEART_HEALTH'],
      cuisinePreferences: ['Mediterranean', 'Middle Eastern', 'British'],
      householdSize: 4,
      cookingSkill: 'CONFIDENT',
      onboardingCompletedAt: at(-45, 19),
      dailyCalorieTarget: 2150,
      dailyProteinTarget: 140,
      dailyFiberTarget: 30,
      dailySodiumTarget: 2000,
      dailyVegServings: 5,
    },
    update: {
      allergies: ['Shellfish'],
      householdSize: 4,
      cookingSkill: 'CONFIDENT',
      onboardingCompletedAt: at(-45, 19),
      dailyCalorieTarget: 2150,
      dailyProteinTarget: 140,
      dailyFiberTarget: 30,
      dailySodiumTarget: 2000,
      dailyVegServings: 5,
    },
  });

  // Idempotency: clear everything this account owns, then rebuild.
  await prisma.$transaction([
    prisma.pantryItem.deleteMany({ where: { userId: demo.id } }),
    prisma.pantryWasteLog.deleteMany({ where: { userId: demo.id } }),
    prisma.mealCompletion.deleteMany({ where: { userId: demo.id } }),
    prisma.shoppingList.deleteMany({ where: { userId: demo.id } }),
    prisma.mealPlan.deleteMany({ where: { userId: demo.id } }),
    prisma.chatSession.deleteMany({ where: { userId: demo.id } }),
    prisma.subscription.deleteMany({ where: { userId: demo.id } }),
    prisma.userFavorite.deleteMany({ where: { userId: demo.id } }),
    prisma.userRating.deleteMany({ where: { userId: demo.id } }),
  ]);

  await prisma.subscription.create({
    data: { userId: demo.id, tier: 'PREMIUM', startDate: at(-45, 12) },
  });

  /* ---------------------------------------------------------------- pantry */
  await prisma.pantryItem.createMany({
    data: PANTRY.map(p => ({
      userId: demo.id,
      name: p.name,
      category: p.category,
      quantity: p.quantity,
      unit: p.unit,
      location: p.location,
      brand: p.brand,
      purchaseDate: at(-7, 11),
      expirationDate: p.expiresIn === undefined ? null : day(p.expiresIn),
      isLowStock: p.isLowStock ?? false,
      lowStockThreshold: 1,
    })),
  });

  /* ------------------------------------------------------------ waste logs */
  await prisma.pantryWasteLog.createMany({
    data: WASTE_SEED.map(w => ({
      userId: demo.id,
      itemName: w.name,
      category: w.category,
      action: w.action,
      quantity: w.qty,
      unit: w.unit,
      estimatedWeightGrams: w.unit === 'ml' ? w.qty : w.qty,
      estimatedValue: Number(((w.qty / 1000) * 6.5).toFixed(2)),
      occurredAt: at(-w.daysAgo, 20),
    })),
  });

  /* -------------------------------------------------- recipes for the plan */
  // Prefer enriched, photographed recipes — those are the ones whose detail
  // screen is complete (macros, safety note, zero-waste note, step tips).
  const enriched = await prisma.recipe.findMany({
    where: { safetyNote: { not: null }, imageUrl: { not: null } },
    select: { id: true, title: true, nutrition: true, mealCategory: true },
    take: 80,
  });
  const fallback = await prisma.recipe.findMany({
    where: { imageUrl: { not: null } },
    select: { id: true, title: true, nutrition: true, mealCategory: true },
    take: 80,
  });
  const pool = enriched.length >= 8 ? enriched : [...enriched, ...fallback];

  if (pool.length === 0) {
    console.warn('  ! No recipes available — run db:import-recipes first.');
    return demo;
  }

  // Course matters: without this the planner cheerfully put Chocolate Raspberry
  // Brownies in a dinner slot. TheMealDB's category is the signal.
  const MAIN = new Set([
    'Chicken', 'Beef', 'Lamb', 'Pork', 'Seafood', 'Pasta', 'Vegetarian',
    'Vegan', 'Goat', 'Miscellaneous', 'Starter',
  ]);

  /**
   * Preference order, not a single set: TheMealDB has few Breakfast recipes, so
   * a strict filter yields nothing and a loose one puts a gratin on the
   * breakfast table. Take the best available tier that isn't empty.
   */
  const firstNonEmpty = (...tiers: Set<string>[]) => {
    for (const tier of tiers) {
      const list = pool.filter(r => r.mealCategory && tier.has(r.mealCategory));
      if (list.length > 0) return list;
    }
    // Last resort: anything that isn't a dessert.
    const notDessert = pool.filter(r => r.mealCategory !== 'Dessert');
    return notDessert.length > 0 ? notDessert : pool;
  };

  const breakfasts = firstNonEmpty(new Set(['Breakfast']), new Set(['Side', 'Miscellaneous']));
  const mains = firstNonEmpty(MAIN, new Set(['Side']));

  // Dinner should be the substantial meal of the day. Sorting mains by calories
  // and taking from the heavier half stops the planner offering a 175 kcal
  // omelette as an evening meal for a household of four.
  const byCalories = [...mains].sort(
    (a, b) => (b.nutrition?.calories ?? 0) - (a.nutrition?.calories ?? 0)
  );
  const dinners = byCalories.slice(0, Math.max(1, Math.ceil(byCalories.length / 2)));
  const lunches = byCalories.slice(Math.ceil(byCalories.length / 2)).length
    ? byCalories.slice(Math.ceil(byCalories.length / 2))
    : byCalories;

  const pickBreakfast = (i: number) => breakfasts[i % breakfasts.length];
  const pickLunch = (i: number) => lunches[i % lunches.length];
  const pickDinner = (i: number) => dinners[i % dinners.length];
  const pickMain = (i: number) => mains[i % mains.length];
  const pick = (i: number) => pool[i % pool.length];

  /* ------------------------------------------------------------- meal plan */
  const plan = await prisma.mealPlan.create({
    data: {
      userId: demo.id,
      name: 'This week',
      description: 'Built around what is already in the kitchen.',
      startDate: day(-new Date().getDay() + 1),
      endDate: day(-new Date().getDay() + 7),
      tags: ['zero-waste', 'high-protein'],
      targetNutrition: { calories: 2150, protein: 140, fiber: 30 },
    },
  });

  // Tags are what the mockup's meal chips render, and they explain the
  // planner's reasoning rather than just labelling the slot.
  const planned: { dayOffset: number; mealType: MealType; recipeIdx: number; tag?: string }[] = [];
  const monday = -new Date().getDay() + 1;
  for (let d = 0; d < 7; d++) {
    planned.push({ dayOffset: monday + d, mealType: MealType.BREAKFAST, recipeIdx: d });
    planned.push({
      dayOffset: monday + d,
      mealType: MealType.LUNCH,
      recipeIdx: d + 7,
      tag: d % 3 === 1 ? 'Leftovers' : undefined,
    });
    planned.push({
      dayOffset: monday + d,
      mealType: MealType.DINNER,
      recipeIdx: d + 14,
      tag: d === 0 ? 'Uses 3 expiring' : d === 2 ? 'Zero waste' : d === 6 ? 'Batch' : undefined,
    });
  }

  await prisma.mealPlanMeal.createMany({
    data: planned.map(m => ({
      mealPlanId: plan.id,
      date: day(m.dayOffset),
      mealType: m.mealType,
      recipeId: (m.mealType === MealType.BREAKFAST
        ? pickBreakfast(m.recipeIdx)
        : m.mealType === MealType.LUNCH
          ? pickLunch(m.recipeIdx)
          : pickDinner(m.recipeIdx)
      ).id,
      servings: m.mealType === MealType.DINNER ? 4 : 2,
      tag: m.tag,
    })),
  });

  /* ------------------------------------------------------ meal completions */
  // 30 days of history so the nutrition card and analytics have real shape.
  const completions = [];
  for (let d = 30; d >= 1; d--) {
    const meals = d % 7 === 0 ? 2 : 3; // lighter on one day a week
    for (let m = 0; m < meals; m++) {
      const recipe =
        m === 0 ? pickBreakfast(d * 3) : m === 1 ? pickLunch(d * 3 + m) : pickDinner(d * 3 + m);
      const n = recipe.nutrition;
      completions.push({
        userId: demo.id,
        recipeId: recipe.id,
        mealType: [MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER][m],
        date: day(-d),
        calories: n?.calories ?? 520 + ((d * 7 + m * 31) % 260),
        protein: n?.protein ?? 28 + ((d * 3 + m * 11) % 22),
        fiber: n?.fiber ?? 6 + ((d + m) % 6),
        servings: 1,
        completedAt: at(-d, [8, 13, 19][m]),
      });
    }
  }
  // Today, partially eaten — so Today's nutrition card shows progress, not a
  // finished day or an empty one.
  const bfast = pickBreakfast(2);
  const lunch = pickMain(9);
  completions.push(
    {
      userId: demo.id, recipeId: bfast.id, mealType: MealType.BREAKFAST, date: day(0),
      calories: bfast.nutrition?.calories ?? 420, protein: bfast.nutrition?.protein ?? 24,
      fiber: bfast.nutrition?.fiber ?? 7, servings: 1, completedAt: at(0, 8),
    },
    {
      userId: demo.id, recipeId: lunch.id, mealType: MealType.LUNCH, date: day(0),
      calories: lunch.nutrition?.calories ?? 610, protein: lunch.nutrition?.protein ?? 38,
      fiber: lunch.nutrition?.fiber ?? 9, servings: 1, completedAt: at(0, 13),
    }
  );
  await prisma.mealCompletion.createMany({ data: completions });

  /* --------------------------------------------------------- shopping list */
  const list = await prisma.shoppingList.create({
    data: {
      userId: demo.id,
      name: 'This week',
      description: 'Built from your meal plan',
      mealPlanId: plan.id,
      tags: ['weekly'],
      items: {
        create: [
          { name: 'Flat-leaf parsley', quantity: 1, unit: 'bunch', category: 'PRODUCE', priority: Priority.HIGH },
          { name: 'Red onions', quantity: 3, unit: 'whole', category: 'PRODUCE', priority: Priority.MEDIUM },
          { name: 'Limes', quantity: 4, unit: 'whole', category: 'PRODUCE', priority: Priority.LOW, isCompleted: true },
          { name: 'Aubergine', quantity: 2, unit: 'whole', category: 'PRODUCE', priority: Priority.MEDIUM },
          { name: 'Chicken thighs', quantity: 900, unit: 'g', category: 'MEAT', priority: Priority.HIGH, isCompleted: true },
          { name: 'Halloumi', quantity: 225, unit: 'g', category: 'DAIRY', priority: Priority.MEDIUM },
          { name: 'Natural yogurt', quantity: 500, unit: 'g', category: 'DAIRY', priority: Priority.MEDIUM, isCompleted: true },
          { name: 'Bulgur wheat', quantity: 500, unit: 'g', category: 'GRAINS', priority: Priority.HIGH },
          { name: 'Olive oil', quantity: 1, unit: 'l', category: 'CONDIMENTS', priority: Priority.HIGH },
          { name: 'Tahini', quantity: 1, unit: 'jar', category: 'CONDIMENTS', priority: Priority.LOW, isCompleted: true },
          { name: 'Tinned tomatoes', quantity: 4, unit: 'tins', category: 'CANNED', priority: Priority.MEDIUM },
          { name: 'Frozen peas', quantity: 1, unit: 'bag', category: 'FROZEN', priority: Priority.LOW },
        ],
      },
    },
  });

  /* ----------------------------------------------------------- chat history */
  const heroRecipe = pickDinner(14);

  const session1 = await prisma.chatSession.create({
    data: { userId: demo.id, title: 'Dinner tonight', isActive: true, createdAt: at(-1, 18) },
  });
  await prisma.chatMessage.createMany({
    data: [
      {
        sessionId: session1.id,
        role: 'USER',
        content: [{ type: 'text', text: 'What can I make tonight? The broccoli needs using.' }],
        timestamp: at(-1, 18),
      },
      {
        sessionId: session1.id,
        role: 'ASSISTANT',
        content: [{
          type: 'text',
          text: `${heroRecipe.title} works well here — it uses the broccoli and the chicken thighs before either turns, and you already have most of what it needs. You'd only be short a couple of things.`,
        }],
        timestamp: at(-1, 18),
        // Exercises the chat recipe card.
        metadata: { type: 'recipe_suggestion', recipeId: heroRecipe.id, confidence: 0.8 },
      },
    ],
  });

  const session2 = await prisma.chatSession.create({
    data: { userId: demo.id, title: 'Using up herbs', isActive: true, createdAt: at(-5, 11) },
  });
  await prisma.chatMessage.createMany({
    data: [
      {
        sessionId: session2.id,
        role: 'USER',
        content: [{ type: 'text', text: 'I keep throwing away herbs. What should I do with them?' }],
        timestamp: at(-5, 11),
      },
      {
        sessionId: session2.id,
        role: 'ASSISTANT',
        content: [{
          type: 'text',
          text: 'Freeze them in oil. Chop whatever is left, pack it into an ice cube tray, cover with olive oil and freeze — you drop a cube straight into a hot pan later. Soft herbs like parsley and cilantro keep about three months that way, which is considerably longer than the four days they get in the fridge.',
        }],
        timestamp: at(-5, 11),
      },
    ],
  });

  const session3 = await prisma.chatSession.create({
    data: { userId: demo.id, title: 'Meal plan for the week', isActive: false, createdAt: at(-12, 9) },
  });
  await prisma.chatMessage.createMany({
    data: [
      {
        sessionId: session3.id,
        role: 'USER',
        content: [{ type: 'text', text: 'Plan my week around what I already have, four people.' }],
        timestamp: at(-12, 9),
      },
      {
        sessionId: session3.id,
        role: 'ASSISTANT',
        content: [{
          type: 'text',
          text: 'Done — seven days, with Sunday set up as a batch cook so Monday and Tuesday lunches come out of it. Two dinners lead on the things closest to turning. The shopping list is written around the gaps, so it skips what you already own.',
        }],
        timestamp: at(-12, 9),
      },
    ],
  });

  /* ------------------------------------------------------ favourites, ratings */
  const favourites = pool.slice(0, 6);
  await prisma.userFavorite.createMany({
    data: favourites.map(r => ({ userId: demo.id, recipeId: r.id })),
    skipDuplicates: true,
  });
  await prisma.userRating.createMany({
    data: pool.slice(0, 4).map((r, i) => ({
      userId: demo.id,
      recipeId: r.id,
      rating: [5, 4, 5, 4][i],
      review: [
        'Made this twice in a fortnight. The whole family finished it.',
        'Good weeknight version. I cut the salt a little.',
        'Better the next day, folded through rice.',
        'Simple and quick. Would make again.',
      ][i],
    })),
    skipDuplicates: true,
  });

  console.log(`  demo account: ${DEMO_EMAIL} / password123 (PREMIUM)`);
  console.log(`    ${PANTRY.length} pantry items, ${WASTE_SEED.length} waste logs, ${completions.length} meal completions`);
  console.log(`    ${planned.length} planned meals, ${12} shopping items, 3 chat sessions`);
  console.log(`    recipe pool: ${pool.length} (${enriched.length} fully enriched)`);

  return demo;
}
