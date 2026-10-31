import { Prisma, PrismaClient } from '../generated/prisma';
import { config } from '../config';
import { EMBEDDING_DIMS } from '../retrieval/embedding';
import { logger } from '../utils/logger';

/**
 * The agent's database handle.
 *
 * This client is generated from a *projection* of the API's schema (see
 * scripts/sync-schema.mjs) and covers three tables: it can read recipes and
 * their ingredients, and it owns recipe_embeddings. It cannot express a query
 * against users, pantry or chat, because those models do not exist in its
 * schema — the boundary is enforced by the type system here and by the
 * database role in production.
 */
export const prisma = new PrismaClient({
  datasources: { db: { url: config.DATABASE_URL } },
  log: config.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/**
 * Prove at startup that the columns the retrieval index reads still exist.
 *
 * The API owns migrations, so a column this service depends on can disappear
 * without anything here failing to compile. Without this probe the first
 * symptom would be a query error during a user's chat turn, in production.
 * With it, the deploy fails instead — which is the correct place to find out.
 */
export const verifyReadModel = async (): Promise<number> => {
  await prisma.recipe.findFirst({
    select: {
      id: true,
      title: true,
      imageUrl: true,
      cuisine: true,
      totalTime: true,
      servings: true,
      dietaryTags: true,
      ingredients: { select: { name: true }, take: 1 },
      embedding: { select: { model: true } },
    },
  });

  // The embedding vector has to be probed too — it is what every semantic
  // query orders by, and a migration that has not reached this database would
  // otherwise surface as a query error during a user's chat turn rather than as
  // a failed deploy.
  //
  // `vector_dims` rather than selecting the column: Prisma cannot deserialise a
  // `vector` result at all, so `SELECT embedding` fails even when the column is
  // perfectly healthy. Going through the function instead proves three things
  // at once — the column exists, the extension is loaded, and the stored
  // dimension is the one the model produces — and returns a plain integer.
  //
  // An empty table returns no rows and that is fine: the column still has to
  // exist for the query to plan at all.
  const [dims] = await prisma.$queryRaw<{ dims: number }[]>(
    Prisma.sql`
      SELECT vector_dims(embedding) AS dims
      FROM recipe_embeddings
      WHERE embedding IS NOT NULL
      LIMIT 1
    `
  );

  if (dims && dims.dims !== EMBEDDING_DIMS) {
    throw new Error(
      `recipe_embeddings.embedding holds ${dims.dims} dimensions but the ` +
        `embedding model produces ${EMBEDDING_DIMS}. Vectors from different ` +
        `models are not comparable — rebuild with ` +
        '`pnpm --filter @petra/agent run embed -- --force`.'
    );
  }

  return prisma.recipe.count({ where: { isPublic: true } });
};

export const connectDatabase = async (): Promise<number> => {
  await prisma.$connect();

  try {
    const recipeCount = await verifyReadModel();
    logger.info('Agent read model verified', { recipes: recipeCount });
    return recipeCount;
  } catch (error) {
    logger.error(
      'Agent read model does not match the database. The API schema has ' +
        'changed in a way this service has not absorbed — run ' +
        '`pnpm --filter @petra/agent run sync-schema` and regenerate.',
      error
    );
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
};
