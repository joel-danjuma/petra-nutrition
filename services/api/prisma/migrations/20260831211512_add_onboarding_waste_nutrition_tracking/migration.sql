-- CreateEnum
CREATE TYPE "CookingSkill" AS ENUM ('BEGINNER', 'CONFIDENT', 'EXPERIENCED');

-- CreateEnum
CREATE TYPE "WasteAction" AS ENUM ('USED', 'WASTED');

-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "cookingSkill" "CookingSkill",
ADD COLUMN     "dailyCalorieTarget" DOUBLE PRECISION,
ADD COLUMN     "dailyFiberTarget" DOUBLE PRECISION,
ADD COLUMN     "dailyProteinTarget" DOUBLE PRECISION,
ADD COLUMN     "dailySodiumTarget" DOUBLE PRECISION,
ADD COLUMN     "dailyVegServings" DOUBLE PRECISION,
ADD COLUMN     "householdSize" INTEGER,
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "pantry_waste_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "category" "ItemCategory" NOT NULL,
    "action" "WasteAction" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "estimatedWeightGrams" DOUBLE PRECISION,
    "estimatedValue" DOUBLE PRECISION,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pantry_waste_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_completions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipeId" TEXT,
    "mealType" "MealType",
    "date" DATE NOT NULL,
    "calories" DOUBLE PRECISION NOT NULL,
    "protein" DOUBLE PRECISION NOT NULL,
    "fiber" DOUBLE PRECISION,
    "servings" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_completions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "pantry_waste_logs" ADD CONSTRAINT "pantry_waste_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_completions" ADD CONSTRAINT "meal_completions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_completions" ADD CONSTRAINT "meal_completions_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
