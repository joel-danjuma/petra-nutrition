import { Prisma } from '../generated/prisma';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { EMBEDDING_DIMS, MODEL_ID, embedBatch, recipeEmbeddingText } from './embedding';

/**
 * Writing embeddings.
 *
 * Shared by the bulk script and by `POST /v1/index/rebuild`, which the API
 * calls after persisting a saved generation. A recipe with no vector is
 * invisible to semantic retrieval, so a newly saved dish that the user then
 * asked about by description would not come back — the one case where a missing
 * embedding is immediately noticeable.
 *
 * Raw SQL because the target is a pgvector column, which Prisma declares as
 * `Unsupported` and cannot write through the client.
 */

/** Write one vector, inserting or replacing whatever was there. */
export async function writeVector(recipeId: string, vector: number[]): Promise<void> {
  // Passed as a parameter and cast, so 384 numbers never reach the query text.
  const literal = `[${vector.join(',')}]`;

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO recipe_embeddings (id, "recipeId", embedding, model, "updatedAt")
    VALUES (gen_random_uuid(), ${recipeId}, ${literal}::vector, ${MODEL_ID}, now())
    ON CONFLICT ("recipeId") DO UPDATE
      SET embedding = ${literal}::vector,
          model = ${MODEL_ID},
          "updatedAt" = now()
  `);
}

/**
 * Embed specific recipes. Returns how many vectors were written.
 *
 * Failure is reported, not thrown: the recipe is already persisted by the time
 * this runs, and refusing the save because the embedding model is cold would
 * lose the user's dish over something a later `pnpm embed` fixes.
 */
export async function embedRecipesByIds(ids: string[]): Promise<number> {
  if (!ids.length) return 0;

  const recipes = await prisma.recipe.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      title: true,
      description: true,
      cuisine: true,
      dietaryTags: true,
      ingredients: { select: { name: true }, orderBy: { order: 'asc' } },
      instructions: { select: { instruction: true }, orderBy: { step: 'asc' }, take: 2 },
    },
  });

  if (!recipes.length) return 0;

  const vectors = await embedBatch(recipes.map(r => recipeEmbeddingText(r)));

  let written = 0;
  for (let i = 0; i < recipes.length; i++) {
    const vector = vectors[i];
    if (!vector || vector.length !== EMBEDDING_DIMS) {
      logger.warn('Skipped an embedding with the wrong dimension', {
        recipeId: recipes[i].id,
        dims: vector?.length ?? 0,
      });
      continue;
    }
    await writeVector(recipes[i].id, vector);
    written++;
  }

  logger.info('Embedded recipes on request', { requested: ids.length, written });
  return written;
}
