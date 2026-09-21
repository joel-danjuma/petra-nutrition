/**
 * Test environment.
 *
 * `validateConfig` is not called in tests, but `config` is imported
 * transitively by almost everything, and a `GROQ_API_KEY` of `''` makes the
 * legacy `AIChatService` constructor throw on import. A placeholder keeps that
 * import-time throw out of tests that never make a model call.
 *
 * `REDIS_URL` is left unset on purpose, so the checkpointer resolves to
 * `MemorySaver` and the nutrition cache is a no-op. A test suite that silently
 * depended on a running Redis would pass locally and fail in CI.
 */
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-key';
process.env.NODE_ENV = 'test';
delete process.env.REDIS_URL;
