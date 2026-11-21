-- The agent's own corner of the database: a schema it can write to, a view of
-- the recipe columns it needs, and a role that can reach nothing else.
--
-- Why: nothing creates the restricted role the agent is meant to use, so
-- docker-compose defaults AGENT_DATABASE_URL to the `postgres` superuser. "The
-- agent is stateless with respect to user data" is then enforced only by which
-- models its generated Prisma schema happens to contain. This makes it a
-- database fact:
-- `petra_agent_ro` can read `agent.recipe_search_v`, read and write the tables
-- in `agent`, and is refused everywhere else.
--
-- None of this is in schema.prisma. Prisma introspects only the datasource's
-- schema (`public`), so objects in `agent` are invisible to it: no drift, no
-- generated model. The API never reads these objects; the agent does, with raw
-- SQL.
--
-- This runs alongside `public.recipe_embeddings` rather than replacing it. The
-- TypeScript agent keeps reading the old table until it moves to this role.

CREATE EXTENSION IF NOT EXISTS vector;

-- Clear what a `prisma migrate reset` leaves behind. Reset drops only the
-- schema Prisma manages (`public`), so `agent` survives it holding an
-- embedding table whose foreign key and view went with `public` and whose rows
-- now point at nothing — and the replay of this migration then fails on
-- "relation already exists". `migrate dev` offers that reset on any drift.
--
-- Dropped only when it contains nothing but this migration's own objects, so a
-- schema someone else created by hand is refused rather than destroyed. The
-- embeddings it held are derived data; `embed` rebuilds them.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'agent') THEN
    RETURN;
  END IF;

  IF EXISTS (
       SELECT 1 FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'agent'
         AND c.relname NOT IN ('recipe_embedding', 'recipe_embedding_pkey',
                               'recipe_embedding_embedding_hnsw',
                               'recipe_search_v')
     )
     OR EXISTS (
       SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'agent'
     ) THEN
    RAISE EXCEPTION
      'schema "agent" already exists and holds objects this migration did '
      'not create; refusing to drop it. Inspect it, then drop or rename it.';
  END IF;

  DROP SCHEMA agent CASCADE;
END
$$;

CREATE SCHEMA agent;

-- Nobody gets anything in `agent` by default. On Postgres 15+ PUBLIC already
-- has no CREATE here; this makes that true on any version.
REVOKE ALL ON SCHEMA agent FROM PUBLIC;

-- One row per recipe. `model_id` records which model produced the vector:
-- vectors from different models are not comparable, so retrieval filters on
-- the current model and a model change re-embeds every row. `content_hash` is
-- a hash of the text that was embedded, so the indexer can skip recipes whose
-- text has not changed and re-embed only the ones that have.
--
-- recipe_id is TEXT because `recipes.id` is (Prisma's uuid() is stored as
-- text). Deleting a recipe deletes its embedding; the cascade runs as the
-- table owner, so the agent role needs no privilege on `recipes` for it.
CREATE TABLE agent.recipe_embedding (
  recipe_id    TEXT        NOT NULL,
  model_id     TEXT        NOT NULL,
  content_hash TEXT        NOT NULL,
  embedding    vector(384) NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT recipe_embedding_pkey PRIMARY KEY (recipe_id),
  CONSTRAINT recipe_embedding_recipe_id_fkey
    FOREIGN KEY (recipe_id) REFERENCES public.recipes (id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- HNSW over cosine distance, for the same reasons as
-- `recipe_embeddings_embedding_hnsw`: embeddings are L2-normalised so cosine
-- and dot product order identically, and HNSW needs no training pass over a
-- corpus that is still growing.
CREATE INDEX recipe_embedding_embedding_hnsw
  ON agent.recipe_embedding
  USING hnsw (embedding vector_cosine_ops);

-- The recipe columns retrieval filters, ranks and displays on — and nothing
-- else. Excluded on purpose: review counts, provenance (`source`,
-- `isAIGenerated`), the safety and zero-waste callouts, and `createdAt`.
-- `created_by_id` stays because a caller's own private recipes are searchable
-- to them (`is_public OR created_by_id = $owner`).
--
-- Columns are snake_case so the agent's SQL does not depend on Prisma's
-- naming, and `difficulty` is cast to text so the role needs nothing from the
-- `Difficulty` enum's schema.
--
-- The view runs with its owner's privileges (no security_invoker), which is
-- what lets the agent read recipes without SELECT on `public.recipes`. The
-- flip side: a simple view like this is auto-updatable, so INSERT/UPDATE/DELETE
-- on it would write through to `recipes` with the owner's rights. It is
-- granted SELECT only, below, and CI asserts that writes through it fail.
CREATE VIEW agent.recipe_search_v AS
SELECT
  r.id,
  r.title,
  r.description,
  r."imageUrl"         AS image_url,
  r.cuisine,
  r."mealCategory"     AS meal_category,
  r."dietaryTags"      AS dietary_tags,
  r.difficulty::text   AS difficulty,
  r.servings,
  r."prepTime"         AS prep_time,
  r."cookTime"         AS cook_time,
  r."totalTime"        AS total_time,
  r.rating,
  r."isPublic"         AS is_public,
  r."createdById"      AS created_by_id,
  r."updatedAt"        AS updated_at
FROM public.recipes r;

-- The role. NOLOGIN, and no password here: a migration is committed to git.
-- Each environment enables it once, out of band:
--
--   ALTER ROLE petra_agent_ro LOGIN PASSWORD '<from the secret store>';
--
-- or grants it to a login role (`GRANT petra_agent_ro TO <agent_login>`).
--
-- Roles are cluster-wide, not per-database, so the guard is needed: Prisma's
-- shadow database lives in the same cluster and replays every migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'petra_agent_ro') THEN
    CREATE ROLE petra_agent_ro NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA agent TO petra_agent_ro;

-- pgvector's `vector` type and `<=>` operator live in `public`, and the role
-- has to resolve them to write or search an embedding. USAGE is name lookup
-- only — it grants nothing on any table — and is otherwise inherited from
-- PUBLIC, which hardened databases revoke and `prisma migrate reset` does not
-- restore when it recreates the schema.
GRANT USAGE ON SCHEMA public TO petra_agent_ro;

GRANT SELECT ON agent.recipe_search_v TO petra_agent_ro;

-- Read/write on the agent's tables. Listed per table rather than through
-- ALTER DEFAULT PRIVILEGES, because default privileges on TABLES also cover
-- views — a later view in `agent` would silently become writable, and write
-- through to `public`. A new table in `agent` grants its own privileges in its
-- own migration; CI fails if one does not.
GRANT SELECT, INSERT, UPDATE, DELETE ON agent.recipe_embedding TO petra_agent_ro;
