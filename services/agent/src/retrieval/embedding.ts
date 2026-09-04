import { pipeline, env } from '@xenova/transformers';

import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Local sentence embeddings.
 *
 * Runs `all-MiniLM-L6-v2` on CPU through ONNX in-process. Chosen over a hosted
 * embedding API because Groq has no embeddings endpoint and the Gemini key is
 * unset — this needs no key, costs nothing, and has no rate limit. The trade is
 * a one-off ~90MB model download on first use and a few hundred ms of warm-up.
 *
 * 384 dimensions. Vectors from different models are not comparable, so
 * `MODEL_ID` is written alongside every stored vector and a change must
 * invalidate the table.
 */

export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIMS = 384;

// Cache the model on disk between runs rather than re-downloading. In Docker
// this path is a named volume, so the ~90MB fetch survives a container restart.
env.cacheDir = config.TRANSFORMERS_CACHE;
// Nothing here should reach for a remote runtime at inference time.
env.allowLocalModels = true;

type Extractor = (
  text: string | string[],
  opts: { pooling: 'mean'; normalize: boolean }
) => Promise<{ data: Float32Array; dims: number[] }>;

let extractorPromise: Promise<Extractor> | null = null;

async function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    logger.info(`Loading embedding model ${MODEL_ID} (first run downloads ~90MB)`);
    extractorPromise = pipeline('feature-extraction', MODEL_ID) as unknown as Promise<Extractor>;
  }
  return extractorPromise;
}

/**
 * Embed a single string. Output is L2-normalised, so cosine similarity is a
 * plain dot product.
 */
export async function embed(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const out = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data);
}

/** Embed many strings, in batches, so a large import doesn't exhaust memory. */
export async function embedBatch(texts: string[], batchSize = 32): Promise<number[][]> {
  const extractor = await getExtractor();
  const vectors: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const out = await extractor(batch, { pooling: 'mean', normalize: true });
    const dims = out.dims[out.dims.length - 1];
    for (let j = 0; j < batch.length; j++) {
      vectors.push(Array.from(out.data.slice(j * dims, (j + 1) * dims)));
    }
  }

  return vectors;
}

/**
 * Cosine similarity. Both inputs are expected to be normalised (everything from
 * `embed`/`embedBatch` is), which reduces this to a dot product.
 */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * The text a recipe is embedded from. Title and ingredients carry most of the
 * retrieval signal; instructions are mostly procedural boilerplate that dilutes
 * it, so only the opening is included.
 */
export function recipeEmbeddingText(recipe: {
  title: string;
  description?: string | null;
  cuisine?: string | null;
  dietaryTags?: string[];
  ingredients?: { name: string }[];
  instructions?: { instruction: string }[];
}): string {
  const parts = [
    recipe.title,
    recipe.cuisine ?? '',
    (recipe.dietaryTags ?? []).join(' '),
    recipe.description ?? '',
    (recipe.ingredients ?? []).map(i => i.name).join(', '),
    (recipe.instructions ?? [])
      .slice(0, 2)
      .map(i => i.instruction)
      .join(' ')
      .slice(0, 400),
  ];
  return parts.filter(Boolean).join('\n');
}

/**
 * Load the model ahead of the first request.
 *
 * Called at startup and allowed to fail: an agent that cannot embed still
 * retrieves usefully on its lexical and pantry-overlap signals, and refusing to
 * boot over a missing optional model would be a worse trade.
 */
export async function warmUp(): Promise<void> {
  const started = Date.now();
  await embed('warm up');
  logger.info(`Embedding model ready in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}
