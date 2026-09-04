-- AlterTable
ALTER TABLE "meal_plan_meals" ADD COLUMN     "tag" TEXT;

-- AlterTable
ALTER TABLE "recipe_instructions" ADD COLUMN     "tip" TEXT;

-- AlterTable
ALTER TABLE "recipes" ADD COLUMN     "safetyNote" TEXT,
ADD COLUMN     "zeroWasteNote" TEXT;

-- CreateTable
CREATE TABLE "recipe_embeddings" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "vector" DOUBLE PRECISION[],
    "model" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recipe_embeddings_recipeId_key" ON "recipe_embeddings"("recipeId");

-- CreateIndex
CREATE INDEX "chat_messages_sessionId_idx" ON "chat_messages"("sessionId");

-- CreateIndex
CREATE INDEX "chat_sessions_userId_idx" ON "chat_sessions"("userId");

-- CreateIndex
CREATE INDEX "meal_completions_userId_date_idx" ON "meal_completions"("userId", "date");

-- CreateIndex
CREATE INDEX "pantry_items_userId_idx" ON "pantry_items"("userId");

-- CreateIndex
CREATE INDEX "pantry_waste_logs_userId_occurredAt_idx" ON "pantry_waste_logs"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "recipe_ingredients_recipeId_idx" ON "recipe_ingredients"("recipeId");

-- CreateIndex
CREATE INDEX "recipe_instructions_recipeId_idx" ON "recipe_instructions"("recipeId");

-- AddForeignKey
ALTER TABLE "recipe_embeddings" ADD CONSTRAINT "recipe_embeddings_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
