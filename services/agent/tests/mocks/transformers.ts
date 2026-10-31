/**
 * Stands in for `@xenova/transformers` under Jest.
 *
 * The real package ships ESM only, and it is reached transitively from
 * `retrieval/embedding.ts` by anything that imports the graph. Adding an ESM
 * transform for a 90MB ONNX model that no test uses would slow every run down
 * for nothing, so it is mapped to this instead.
 *
 * `pipeline` rejects rather than returning zeros: a test that genuinely needs
 * embeddings should fail loudly here, not quietly compare vectors of zeroes and
 * pass. Retrieval already degrades to its lexical and pantry signals when the
 * model is unavailable, which is the path tests exercise.
 */
export const env: Record<string, unknown> = { cacheDir: '', allowLocalModels: true };

export const pipeline = async (): Promise<never> => {
  throw new Error(
    'The embedding model is stubbed under test. Stub retrievalService.search ' +
      'instead of relying on real vectors.'
  );
};
