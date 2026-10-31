-- Ingredients the generator left off a list because the pantry covered them.
ALTER TABLE "shopping_lists" ADD COLUMN "skippedItems" JSONB;
