-- Move recipe embeddings from a Postgres float array to a pgvector column.
--
-- Why: retrieval used to load every public recipe into the agent's process
-- memory — token sets and 384-dimension vectors — and score all of them in
-- JavaScript on every query. That is correct at a few hundred recipes and
-- untenable at a million: multiple gigabytes resident per replica, and a full
-- scan per chat turn. An indexed `<=>` search does the same work in the
-- database, over an index, and returns a bounded candidate set.
--
-- The conversion is lossless. `vector` is a 384-float array and so was the old
-- column, so every existing embedding carries over and nothing needs
-- re-embedding. Rows whose dimension does not match are left null rather than
-- failing the migration; `embed-recipes` will refill them.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "recipe_embeddings" ADD COLUMN "embedding" vector(384);

-- Carry the existing vectors across. `array_to_string` then a cast is the
-- documented route from float8[] to vector; the dimension guard keeps a stale
-- row from aborting the whole statement.
UPDATE "recipe_embeddings"
SET "embedding" = ('[' || array_to_string("vector", ',') || ']')::vector(384)
WHERE array_length("vector", 1) = 384;

ALTER TABLE "recipe_embeddings" DROP COLUMN "vector";

-- HNSW over cosine distance.
--
-- Cosine because the embeddings are L2-normalised at write time, so cosine
-- distance and the dot product order identically and the choice costs nothing.
-- HNSW rather than IVFFlat because it needs no training pass over a corpus
-- that is still growing, and its recall does not degrade as rows are added
-- between rebuilds.
CREATE INDEX "recipe_embeddings_embedding_hnsw"
  ON "recipe_embeddings"
  USING hnsw ("embedding" vector_cosine_ops);

-- Retrieval's other two signals are lexical, and both were doing sequential
-- scans with ILIKE. Trigram indexes make the same queries index-assisted.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "recipes_title_trgm"
  ON "recipes" USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "recipe_ingredients_name_trgm"
  ON "recipe_ingredients" USING gin ("name" gin_trgm_ops);

-- Every retrieval query filters on this first, and at a million rows the
-- planner needs the option of an index-only scan over the public subset.
CREATE INDEX IF NOT EXISTS "recipes_is_public_idx" ON "recipes" ("isPublic");
