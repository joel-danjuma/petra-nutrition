/**
 * Proves the agent's projected read model matches a migrated database — the
 * same probe the agent runs at boot, without starting the server.
 *
 *   pnpm --filter @petra/agent run verify-read-model
 *
 * CI runs this against the freshly migrated test database. It was a
 * `tsx -e "import('./src/db')..."` one-liner, but how a dynamic import exposes
 * a transpiled module's named exports depends on the Node version, and on
 * Node 22 `connectDatabase` was not one of them. A static import is not.
 */

import { connectDatabase, disconnectDatabase } from '../db';

connectDatabase()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
