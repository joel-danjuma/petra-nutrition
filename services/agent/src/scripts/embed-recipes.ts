/**
 * Builds semantic search vectors for every recipe.
 *
 *   pnpm --filter @petra/agent run embed
 *
 * Idempotent: recipes already embedded with the current model are skipped, so
 * this is safe to re-run after an import. Pass --force to rebuild everything
 * (needed if MODEL_ID ever changes, since vectors from different models are
 * not comparable).
 */

import { prisma } from '../db';
import {
  EMBEDDING_DIMS,
  MODEL_ID,
  embedBatch,
  recipeEmbeddingText,
} from '../retrieval/embedding';

const FORCE = process.argv.includes('--force');

async function main() {
  const recipes = await prisma.recipe.findMany({
    include: {
      ingredients: { select: { name: true }, orderBy: { order: 'asc' } },
      instructions: { select: { instruction: true }, orderBy: { step: 'asc' }, take: 2 },
      embedding: { select: { model: true } },
    },
  });

  const pending = FORCE
    ? recipes
    : recipes.filter(r => !r.embedding || r.embedding.model !== MODEL_ID);

  console.log(`${recipes.length} recipes, ${pending.length} need embedding (model ${MODEL_ID})`);
  if (pending.length === 0) return;

  const texts = pending.map(r => recipeEmbeddingText(r));

  const started = Date.now();
  const vectors = await embedBatch(texts);
  console.log(`embedded in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  let written = 0;
  for (let i = 0; i < pending.length; i++) {
    const vector = vectors[i];
    if (!vector || vector.length !== EMBEDDING_DIMS) {
      console.warn(`  skipped "${pending[i].title}" — got ${vector?.length ?? 0} dims`);
      continue;
    }
    await prisma.recipeEmbedding.upsert({
      where: { recipeId: pending[i].id },
      create: { recipeId: pending[i].id, vector, model: MODEL_ID },
      update: { vector, model: MODEL_ID },
    });
    written++;
    if (written % 100 === 0) process.stdout.write(`  wrote ${written}\r`);
  }

  const total = await prisma.recipeEmbedding.count();
  console.log(`\n  wrote ${written}; ${total} embeddings in db`);
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
