/**
 * Test environment.
 *
 * `GROQ_API_KEY` is pinned to whatever the shell supplied, or `''`. Pinning it
 * matters because `config` calls `dotenv.config()`, which never overrides a
 * variable that is already set: without this line a developer's
 * `services/agent/.env` would hand the suite a real key, and the live test
 * would start spending tokens on an ordinary `pnpm test`. No model client is
 * built at import any more, so an empty key costs the scripted tests nothing.
 *
 * `REDIS_URL` is left unset on purpose, so the checkpointer resolves to
 * `MemorySaver` and the nutrition cache is a no-op. A test suite that silently
 * depended on a running Redis would pass locally and fail in CI.
 */
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY ?? '';
process.env.NODE_ENV = 'test';
delete process.env.REDIS_URL;
