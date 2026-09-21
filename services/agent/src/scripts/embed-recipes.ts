/**
 * Builds semantic search vectors for every recipe.
 *
 *   pnpm --filter @petra/agent run embed
 *   pnpm --filter @petra/agent run embed -- --force
 *   pnpm --filter @petra/agent run embed -- --limit 5000
 *
 * Idempotent: recipes already embedded with the current model are skipped, so
 * this is safe to re-run after an import. Pass --force to rebuild everything
 * (needed if MODEL_ID ever changes, since vectors from different models are
 * not comparable).
 *
 * SIZING. This is the long pole in a bulk import, and it is worth knowing the
 * number before starting rather than after. MiniLM on CPU embeds roughly
 * 100-300 short texts per second per core, so a 100k-recipe corpus is tens of
 * minutes and a million is several hours. It is resumable — that is what the
 * skip is for — so `--limit` exists to run it in sessions and to measure the
 * rate on a sample before committing to the whole corpus. The progress line
 * prints a running rate for exactly that purpose.
 *
 * Writes go through raw SQL because the vector column is pgvector, which Prisma
 * declares as `Unsupported` and cannot write through the client.
 */

import { Prisma } from '../generated/prisma';
import { prisma } from '../db';
import {
  EMBEDDING_DIMS,
  MODEL_ID,
  embedBatch,
  recipeEmbeddingText,
} from '../retrieval/embedding';
// Shared with POST /v1/index/rebuild rather than reimplemented: two copies of
// the write is how the script and the endpoint end up disagreeing about the
// model column, and a stale `model` value makes a vector silently invisible to
// retrieval rather than merely wrong.
import { writeVector } from '../retrieval/store';

const FORCE = process.argv.includes('--force');

const argValue = (flag: string): number | undefined => {
  const at = process.argv.indexOf(flag);
  if (at === -1) return undefined;
  const value = Number(process.argv[at + 1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
};

/** How many recipes to embed in one run. Unset means all of them. */
const LIMIT = argValue('--limit');

/**
 * Rows loaded per pass.
 *
 * The recipe rows themselves are what would exhaust memory on a large corpus —
 * `findMany` with no bound over a million recipes and their ingredients is
 * hundreds of megabytes before a single vector exists. Selecting a page at a
 * time keeps the resident set flat regardless of corpus size, which is the
 * whole point of this phase.
 */
const PAGE = 500;

async function embeddingsWritten(): Promise<number> {
  const [row] = await prisma.$queryRaw<{ count: bigint }[]>(
    Prisma.sql`SELECT count(*) AS count FROM recipe_embeddings WHERE embedding IS NOT NULL AND model = ${MODEL_ID}`
  );
  return Number(row?.count ?? 0);
}

async function main() {
  const total = await prisma.recipe.count();
  console.log(`${total} recipes in the database; model ${MODEL_ID}`);

  const started = Date.now();
  let scanned = 0;
  let written = 0;
  let skipped = 0;

  for (let offset = 0; offset < total; offset += PAGE) {
    if (LIMIT !== undefined && written >= LIMIT) break;

    const page = await prisma.recipe.findMany({
      skip: offset,
      take: PAGE,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        title: true,
        description: true,
        cuisine: true,
        dietaryTags: true,
        ingredients: { select: { name: true }, orderBy: { order: 'asc' } },
        instructions: { select: { instruction: true }, orderBy: { step: 'asc' }, take: 2 },
        embedding: { select: { model: true } },
      },
    });

    if (!page.length) break;
    scanned += page.length;

    const pending = FORCE
      ? page
      : page.filter(r => !r.embedding || r.embedding.model !== MODEL_ID);

    if (!pending.length) continue;

    const budget = LIMIT === undefined ? pending.length : Math.min(pending.length, LIMIT - written);
    const batch = pending.slice(0, budget);

    const vectors = await embedBatch(batch.map(r => recipeEmbeddingText(r)));

    for (let i = 0; i < batch.length; i++) {
      const vector = vectors[i];
      if (!vector || vector.length !== EMBEDDING_DIMS) {
        console.warn(`  skipped "${batch[i].title}" — got ${vector?.length ?? 0} dims`);
        skipped++;
        continue;
      }
      await writeVector(batch[i].id, vector);
      written++;
    }

    // A running rate, so a large corpus can be sized from a sample rather than
    // guessed at. This is the number to read before committing to a full run.
    const elapsed = (Date.now() - started) / 1000;
    process.stdout.write(
      `  ${written} written, ${scanned}/${total} scanned, ` +
        `${(written / Math.max(elapsed, 0.001)).toFixed(1)}/s\r`
    );
  }

  const elapsed = (Date.now() - started) / 1000;
  console.log(
    `\n  wrote ${written} in ${elapsed.toFixed(1)}s ` +
      `(${(written / Math.max(elapsed, 0.001)).toFixed(1)}/s)` +
      (skipped ? `, skipped ${skipped}` : '')
  );
  console.log(`  ${await embeddingsWritten()} usable embeddings in the database`);
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
