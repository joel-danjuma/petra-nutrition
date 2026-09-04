#!/usr/bin/env node
/**
 * Generate the agent's Prisma schema as a projection of the API's.
 *
 * The agent reads recipe data and owns the embeddings table, but the API is the
 * single owner of the database schema and of every migration. Hand-copying the
 * three models it needs would drift the moment someone renamed a column: the
 * API's migration would pass, and the agent would fail at chat time, in
 * production, for the first user who asked a question.
 *
 * So the agent's schema is generated instead. Narrowness lives in MODELS below;
 * correctness is guaranteed by the fact that the field definitions are copied
 * verbatim from the source of truth. CI regenerates and diffs, so a schema
 * change that the agent has not absorbed fails the pull request that made it.
 *
 *   node scripts/sync-schema.mjs          # write
 *   node scripts/sync-schema.mjs --check  # exit 1 if out of date
 *
 * Mirrors the generate-and-commit pattern already used by
 * scripts/gen-design-tokens.mjs at the repo root.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(HERE, '../../api/prisma/schema.prisma');
const OUT = resolve(HERE, '../prisma/schema.prisma');

/** The only models the agent may see. Everything else is the API's business. */
const MODELS = ['Recipe', 'RecipeIngredient', 'RecipeInstruction', 'RecipeEmbedding'];

const source = readFileSync(SOURCE, 'utf8');

/** Collect every block of a given kind, keyed by name. */
function collectBlocks(text, keyword) {
  const blocks = new Map();
  const re = new RegExp(`^${keyword}\\s+(\\w+)\\s*\\{([\\s\\S]*?)^\\}`, 'gm');
  let match;
  while ((match = re.exec(text)) !== null) {
    blocks.set(match[1], match[2]);
  }
  return blocks;
}

const allModels = collectBlocks(source, 'model');
const allEnums = collectBlocks(source, 'enum');

for (const name of MODELS) {
  if (!allModels.has(name)) {
    console.error(
      `sync-schema: model "${name}" is no longer in the API schema. ` +
        `Either it was renamed — update MODELS — or the agent's read model is obsolete.`
    );
    process.exit(1);
  }
}

const kept = new Set(MODELS);
const usedEnums = new Set();

/**
 * Rewrite one model body, dropping relation fields that point at models the
 * agent does not carry. A relation to a dropped model cannot be kept: Prisma
 * refuses to validate a schema referencing an unknown type.
 */
function projectModel(name, body) {
  const out = [];

  for (const rawLine of body.split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    const trimmed = line.trim();

    // Blank lines, comments, and block attributes (@@map, @@index) pass through.
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('///') || trimmed.startsWith('@@')) {
      out.push(line);
      continue;
    }

    const field = trimmed.match(/^(\w+)\s+(\w+)(\[\])?(\?)?/);
    if (!field) {
      out.push(line);
      continue;
    }

    const [, fieldName, typeName] = field;

    // A relation to a model we are not carrying: drop it.
    if (allModels.has(typeName) && !kept.has(typeName)) {
      out.push(
        `  // ${fieldName}: relation to ${typeName}, omitted — not part of the agent's read model`
      );
      continue;
    }

    if (allEnums.has(typeName)) usedEnums.add(typeName);

    out.push(line);
  }

  // Collapse the runs of blank lines that dropping relations tends to leave.
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '\n')
    .replace(/\n+$/, '\n');
}

const modelBlocks = MODELS.map(
  name => `model ${name} {${projectModel(name, allModels.get(name))}}`
);

const enumBlocks = [...usedEnums]
  .sort()
  .map(name => `enum ${name} {${allEnums.get(name)}}`);

const header = `// ------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
//
// A projection of services/api/prisma/schema.prisma, limited to the models the
// agent reads. Regenerate with:
//
//     pnpm --filter @petra/agent run sync-schema
//
// The API owns every migration. This schema declares none and must never be
// used with \`prisma migrate\`; \`prisma generate\` only.
//
// Models: ${MODELS.join(', ')}
// ------------------------------------------------------------------

generator client {
  provider = "prisma-client-js"
  // Generated into the agent's own tree rather than node_modules/.prisma/client:
  // the workspace hoists dependencies (shamefullyHoist), so two Prisma clients
  // sharing the default output path would overwrite each other.
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`;

const rendered = [header, ...modelBlocks, ...enumBlocks].join('\n\n') + '\n';

if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== rendered) {
    console.error(
      'sync-schema: services/agent/prisma/schema.prisma is out of date.\n' +
        'The API schema changed in a way the agent has not absorbed.\n' +
        'Run: pnpm --filter @petra/agent run sync-schema'
    );
    process.exit(1);
  }
  console.log('sync-schema: agent schema is up to date.');
  process.exit(0);
}

writeFileSync(OUT, rendered);
console.log(
  `sync-schema: wrote ${OUT.split('/').slice(-3).join('/')} ` +
    `(${MODELS.length} models, ${usedEnums.size} enums)`
);
