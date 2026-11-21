-- Checks the `agent` schema, the search view and the `petra_agent_ro` role
-- against a freshly migrated database. Run by CI after `prisma migrate deploy`:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/checks/agent-schema.sql
--
-- Connect as a superuser (or the migrating role): the script seeds a recipe,
-- switches to petra_agent_ro for the checks, and rolls everything back, so the
-- database is left exactly as the migrations made it.

\set ON_ERROR_STOP on

BEGIN;

-- ── Catalog checks: what the role holds, as Postgres records it ────────────

-- The view's surface is pinned. Adding a column to it is a decision about
-- what the agent can see, so it must change this list too.
DO $$
DECLARE
  expected text[] := ARRAY[
    'id', 'title', 'description', 'image_url', 'cuisine', 'meal_category',
    'dietary_tags', 'difficulty', 'servings', 'prep_time', 'cook_time',
    'total_time', 'rating', 'is_public', 'created_by_id', 'updated_at'
  ];
  actual text[];
BEGIN
  SELECT array_agg(column_name::text ORDER BY ordinal_position) INTO actual
  FROM information_schema.columns
  WHERE table_schema = 'agent' AND table_name = 'recipe_search_v';

  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'agent.recipe_search_v columns are %, expected %',
      actual, expected;
  END IF;
END
$$;

-- No privilege of any kind on anything in `public`.
DO $$
DECLARE
  leaked text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO leaked
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND has_table_privilege('petra_agent_ro', c.oid,
          'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER');

  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'petra_agent_ro has privileges on public: %', leaked;
  END IF;
END
$$;

-- Read/write on every table in `agent` — so a future table that forgets its
-- GRANT fails here — and read-only on every view, because a writable view
-- would write through to `public` with the view owner's rights.
DO $$
DECLARE
  rel record;
  priv text;
BEGIN
  FOR rel IN
    SELECT c.oid, c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'agent' AND c.relkind IN ('r', 'p', 'v', 'm')
  LOOP
    IF NOT has_table_privilege('petra_agent_ro', rel.oid, 'SELECT') THEN
      RAISE EXCEPTION 'petra_agent_ro cannot SELECT agent.%', rel.relname;
    END IF;

    FOREACH priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
      IF rel.relkind IN ('r', 'p')
         AND NOT has_table_privilege('petra_agent_ro', rel.oid, priv) THEN
        RAISE EXCEPTION 'petra_agent_ro lacks % on table agent.%',
          priv, rel.relname;
      END IF;
      IF rel.relkind IN ('v', 'm')
         AND has_table_privilege('petra_agent_ro', rel.oid, priv) THEN
        RAISE EXCEPTION 'petra_agent_ro has % on view agent.%',
          priv, rel.relname;
      END IF;
    END LOOP;
  END LOOP;
END
$$;

DO $$
BEGIN
  IF has_schema_privilege('petra_agent_ro', 'agent', 'CREATE') THEN
    RAISE EXCEPTION 'petra_agent_ro can create objects in schema agent';
  END IF;
  IF has_schema_privilege('petra_agent_ro', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'petra_agent_ro can create objects in schema public';
  END IF;
  IF (SELECT rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls
      FROM pg_roles WHERE rolname = 'petra_agent_ro') THEN
    RAISE EXCEPTION 'petra_agent_ro has a role attribute it should not';
  END IF;
END
$$;

-- ── Behavioural checks: the same rules, exercised as the role ──────────────

INSERT INTO public.recipes
  (id, title, servings, "prepTime", "cookTime", "totalTime", difficulty,
   "updatedAt")
VALUES
  ('ci-agent-schema-check', 'CI agent schema check', 2, 5, 10, 15, 'EASY',
   now());

SET LOCAL ROLE petra_agent_ro;

-- The query the step exists for, printed into the CI log.
SELECT id, title, difficulty, total_time, is_public
FROM agent.recipe_search_v
WHERE id = 'ci-agent-schema-check';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent.recipe_search_v
    WHERE id = 'ci-agent-schema-check'
      AND difficulty = 'EASY'
      AND dietary_tags = '{}'
      AND is_public
  ) THEN
    RAISE EXCEPTION 'agent.recipe_search_v did not return the seeded recipe';
  END IF;
END
$$;

-- Write, upsert and search an embedding. The FK check against `recipes` runs
-- as the table owner, so it must pass without the role holding any privilege
-- on `recipes`.
INSERT INTO agent.recipe_embedding (recipe_id, model_id, content_hash, embedding)
VALUES ('ci-agent-schema-check', 'ci-model', 'hash-1',
        array_fill(0.1::real, ARRAY[384])::vector);

INSERT INTO agent.recipe_embedding (recipe_id, model_id, content_hash, embedding)
VALUES ('ci-agent-schema-check', 'ci-model', 'hash-2',
        array_fill(0.2::real, ARRAY[384])::vector)
ON CONFLICT (recipe_id) DO UPDATE
SET content_hash = EXCLUDED.content_hash,
    embedding    = EXCLUDED.embedding,
    updated_at   = now();

DO $$
DECLARE
  hit text;
BEGIN
  SELECT v.id INTO hit
  FROM agent.recipe_embedding e
  JOIN agent.recipe_search_v v ON v.id = e.recipe_id
  WHERE e.model_id = 'ci-model'
  ORDER BY e.embedding <=> array_fill(0.2::real, ARRAY[384])::vector
  LIMIT 1;

  IF hit IS DISTINCT FROM 'ci-agent-schema-check' THEN
    RAISE EXCEPTION 'nearest-neighbour search as petra_agent_ro returned %',
      hit;
  END IF;
END
$$;

-- Each of these must be refused with insufficient_privilege. Any other
-- outcome — success included — fails the script.
DO $$
DECLARE
  attempt text;
BEGIN
  FOREACH attempt IN ARRAY ARRAY[
    'SELECT 1 FROM public.recipes LIMIT 1',
    'SELECT 1 FROM public.users LIMIT 1',
    'SELECT 1 FROM public.pantry_items LIMIT 1',
    'SELECT 1 FROM public.chat_messages LIMIT 1',
    'SELECT 1 FROM public.recipe_embeddings LIMIT 1',
    $q$UPDATE agent.recipe_search_v SET title = 'x'
       WHERE id = 'ci-agent-schema-check'$q$,
    $q$DELETE FROM agent.recipe_search_v
       WHERE id = 'ci-agent-schema-check'$q$,
    'CREATE TABLE agent.ci_should_not_exist (id int)'
  ] LOOP
    BEGIN
      EXECUTE attempt;
      RAISE EXCEPTION 'petra_agent_ro was allowed: %', attempt;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END LOOP;
END
$$;

RESET ROLE;

-- Deleting a recipe removes its embedding.
DELETE FROM public.recipes WHERE id = 'ci-agent-schema-check';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM agent.recipe_embedding
    WHERE recipe_id = 'ci-agent-schema-check'
  ) THEN
    RAISE EXCEPTION 'deleting a recipe left its agent.recipe_embedding row';
  END IF;
END
$$;

ROLLBACK;

\echo 'agent schema checks passed'
