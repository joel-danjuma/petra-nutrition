import { Prisma } from '../generated/prisma';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { MODEL_ID } from './embedding';

/**
 * Candidate generation, in the database.
 *
 * The three retrieval signals are unchanged in spirit — pantry overlap,
 * lexical, semantic — but each is now a bounded SQL query returning ids and a
 * rank, rather than a pass over every public recipe held in process memory.
 * Fusion stays in TypeScript, where it belongs: RRF over three short candidate
 * lists is a few hundred operations, and expressing it in SQL would make it
 * harder to read for no gain.
 *
 * The shape that matters: nothing here returns more than `CANDIDATES` rows per
 * signal, and the safety filter is applied *inside* each query rather than
 * afterwards. Filtering after the fact would let a blocked recipe consume a
 * candidate slot and push a safe one out of the results.
 */

/**
 * How many candidates each signal contributes.
 *
 * Wide enough that fusion has something to work with — a recipe ranked 40th on
 * semantic similarity and 3rd on pantry coverage should still surface — and
 * narrow enough that three queries and the hydration that follows stay well
 * inside a chat turn's latency budget.
 */
const CANDIDATES = 60;

export interface Candidate {
  id: string;
  /** 0-based rank within this signal. */
  rank: number;
}

/**
 * Build the regex that blocked terms are matched with.
 *
 * `\y` is Postgres's word boundary, and it is the whole reason this is a regex
 * rather than a pile of ILIKE patterns: `%nut%` matches "butternut squash",
 * so a nut allergy would quietly remove most of the vegetarian corpus. An
 * optional trailing `s` covers the plural without needing a stemmer in SQL.
 *
 * Returns null when there is nothing to block, so callers can skip the clause
 * entirely rather than testing against a pattern that matches nothing.
 */
export function blockedPattern(terms: string[]): string | null {
  const cleaned = [...new Set(terms.map(t => t.trim().toLowerCase()).filter(Boolean))]
    // Terms come from our own tables and are alphanumeric plus spaces, but
    // escaping anyway means a future addition cannot become a regex injection.
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (!cleaned.length) return null;
  return `\\y(${cleaned.join('|')})s?\\y`;
}

/** The same pattern construction, for the terms we want to *find*. */
export const matchPattern = blockedPattern;

/**
 * Which recipes this caller may see.
 *
 * The public corpus, plus their own — a saved generation is written private, so
 * without the second half it is embedded and then permanently unfindable. The
 * owner id arrives in the request like every other fact about the caller, and
 * `createdById` is already in the agent's read model.
 */
const visibilityClause = (ownerId: string | undefined): Prisma.Sql =>
  ownerId
    ? Prisma.sql`(r."isPublic" = true OR r."createdById" = ${ownerId})`
    : Prisma.sql`r."isPublic" = true`;

/**
 * The safety clause, as a fragment every candidate query includes.
 *
 * Applied to the title as well as the ingredients, because "Seafood rice"
 * declares itself in the name even when its ingredient list only says "Frozen
 * Seafood mix".
 */
const safetyClause = (pattern: string | null): Prisma.Sql =>
  pattern === null
    ? Prisma.sql``
    : Prisma.sql`
      AND r.title !~* ${pattern}
      AND NOT EXISTS (
        SELECT 1 FROM recipe_ingredients bi
        WHERE bi."recipeId" = r.id AND bi.name ~* ${pattern}
      )`;

/**
 * Signal 1 — pantry coverage.
 *
 * A set-cover problem, and the signal that actually matters for a pantry app:
 * embeddings cannot tell you that you are missing the one ingredient the dish
 * is named after. Ranked by the *fraction* of a recipe's ingredients the user
 * has, not the count, so a five-ingredient dish they can almost make beats a
 * twenty-ingredient one they share four items with.
 */
export async function pantryCandidates(
  pantryTerms: string[],
  blocked: string | null,
  ownerId?: string
): Promise<Candidate[]> {
  const pattern = matchPattern(pantryTerms);
  if (!pattern) return [];

  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT r.id,
           count(DISTINCT i.name) FILTER (WHERE i.name ~* ${pattern})::float
             / NULLIF(count(DISTINCT i.name), 0) AS coverage
    FROM recipes r
    JOIN recipe_ingredients i ON i."recipeId" = r.id
    WHERE ${visibilityClause(ownerId)}
      ${safetyClause(blocked)}
    GROUP BY r.id
    HAVING count(DISTINCT i.name) FILTER (WHERE i.name ~* ${pattern}) > 0
    ORDER BY coverage DESC, r.rating DESC NULLS LAST
    LIMIT ${CANDIDATES}
  `);

  return rows.map((row, rank) => ({ id: row.id, rank }));
}

/**
 * Signal 2 — lexical.
 *
 * "harissa chicken". Trigram similarity on the title, plus an exact-ish match
 * on ingredient names, which is what the pre-split search was missing: it only
 * looked at title and description, so an ingredient query never matched.
 */
export async function lexicalCandidates(
  query: string,
  blocked: string | null,
  ownerId?: string
): Promise<Candidate[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT r.id,
           GREATEST(
             similarity(r.title, ${trimmed}) * 2,
             COALESCE((
               SELECT max(similarity(i.name, ${trimmed}))
               FROM recipe_ingredients i WHERE i."recipeId" = r.id
             ), 0),
             CASE WHEN r.cuisine IS NOT NULL
                  THEN similarity(r.cuisine, ${trimmed}) * 0.5 ELSE 0 END
           ) AS score
    FROM recipes r
    WHERE ${visibilityClause(ownerId)}
      ${safetyClause(blocked)}
      AND (
        r.title %> ${trimmed}
        OR EXISTS (
          SELECT 1 FROM recipe_ingredients i
          WHERE i."recipeId" = r.id AND i.name %> ${trimmed}
        )
      )
    ORDER BY score DESC, r.rating DESC NULLS LAST
    LIMIT ${CANDIDATES}
  `);

  return rows.map((row, rank) => ({ id: row.id, rank }));
}

/**
 * Signal 3 — semantic.
 *
 * "something warming for a cold night" — intent that shares no words with the
 * recipe. `<=>` is pgvector's cosine distance and uses the HNSW index, so this
 * is a bounded index search rather than the full scan the in-memory version
 * did.
 *
 * The `model` guard is load-bearing: vectors from different embedding models
 * are not comparable, so a model change must make every stale row invisible
 * rather than merely inaccurate.
 */
export async function semanticCandidates(
  queryVector: number[],
  blocked: string | null,
  ownerId?: string
): Promise<Candidate[]> {
  if (!queryVector.length) return [];

  // pgvector's text input format. Passed as a parameter and cast in SQL, so
  // the numbers never reach the query string.
  const literal = `[${queryVector.join(',')}]`;

  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT r.id
    FROM recipe_embeddings e
    JOIN recipes r ON r.id = e."recipeId"
    WHERE ${visibilityClause(ownerId)}
      AND e.model = ${MODEL_ID}
      AND e.embedding IS NOT NULL
      ${safetyClause(blocked)}
    ORDER BY e.embedding <=> ${literal}::vector
    LIMIT ${CANDIDATES}
  `);

  return rows.map((row, rank) => ({ id: row.id, rank }));
}

export interface HydratedRecipe {
  id: string;
  title: string;
  imageUrl: string | null;
  cuisine: string | null;
  totalTime: number;
  servings: number;
  dietaryTags: string[];
  ingredients: string[];
}

/**
 * Fetch the details for a fused candidate set.
 *
 * One query for the shortlist rather than the whole corpus, which is the
 * difference this phase is about: the rows that leave the database are the ones
 * that will be shown.
 */
export async function hydrate(ids: string[]): Promise<Map<string, HydratedRecipe>> {
  if (!ids.length) return new Map();

  const rows = await prisma.recipe.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      title: true,
      imageUrl: true,
      cuisine: true,
      totalTime: true,
      servings: true,
      dietaryTags: true,
      ingredients: { select: { name: true }, orderBy: { order: 'asc' } },
    },
  });

  return new Map(
    rows.map(r => [
      r.id,
      { ...r, ingredients: r.ingredients.map(i => i.name) },
    ])
  );
}

/** Whether pgvector and the trigram indexes are actually present. */
export async function verifySearchCapability(): Promise<{
  pgvector: boolean;
  pgTrgm: boolean;
  embedded: number;
}> {
  const [extensions] = await Promise.all([
    prisma.$queryRaw<{ extname: string }[]>(
      Prisma.sql`SELECT extname FROM pg_extension WHERE extname IN ('vector', 'pg_trgm')`
    ),
  ]);

  const names = new Set(extensions.map(e => e.extname));

  let embedded = 0;
  if (names.has('vector')) {
    const [row] = await prisma.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT count(*) AS count FROM recipe_embeddings WHERE embedding IS NOT NULL AND model = ${MODEL_ID}`
    );
    embedded = Number(row?.count ?? 0);
  }

  const capability = {
    pgvector: names.has('vector'),
    pgTrgm: names.has('pg_trgm'),
    embedded,
  };

  if (!capability.pgvector) {
    logger.warn(
      'The `vector` extension is missing, so semantic retrieval is unavailable. ' +
        'Retrieval degrades to its lexical and pantry-overlap signals. Run the ' +
        'API migrations against a Postgres with pgvector (docker/docker-compose ' +
        'uses pgvector/pgvector:pg15).'
    );
  }
  if (!capability.pgTrgm) {
    logger.warn('The `pg_trgm` extension is missing, so lexical retrieval is unavailable.');
  }

  return capability;
}
