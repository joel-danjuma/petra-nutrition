/**
 * Write the wire contract as a single JSON Schema document,
 * contract.schema.json, next to this package's package.json.
 *
 * The Python agent (services/agent-py) generates its pydantic models from this
 * file rather than hand-copying the zod schemas, so a contract change reaches
 * both agents by the same route: edit index.ts, then run `make contract`.
 *
 * Every exported `fooBarSchema` becomes `definitions.FooBar`. Schemas are
 * registered by identity, so a schema nested inside another is emitted as a
 * `$ref` to its own definition instead of being inlined — the Python side then
 * gets one `ChatMessage` model, not a copy per use site.
 *
 *   tsx scripts/export-json-schema.ts
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ZodType } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import * as contract from '../src';

const OUT = resolve(__dirname, '../contract.schema.json');
const SUFFIX = 'Schema';

const definitions: Record<string, ZodType> = {};
for (const [name, value] of Object.entries(contract)) {
  if (!(value instanceof ZodType) || !name.endsWith(SUFFIX)) continue;
  const model = name.slice(0, -SUFFIX.length);
  definitions[model.charAt(0).toUpperCase() + model.slice(1)] = value;
}

// visionResponseSchema is an alias of detectedPantryItemSchema. Registering
// both would leave the generator to pick one name for the shared instance, so
// keep the first name each instance was exported under.
const seen = new Set<ZodType>();
for (const [name, schema] of Object.entries(definitions)) {
  if (seen.has(schema)) delete definitions[name];
  seen.add(schema);
}

const { definitions: emitted } = zodToJsonSchema(contract.agentHealthSchema, {
  definitions,
  target: 'jsonSchema7',
  // Requests are validated on arrival, so a field with a zod default is
  // optional on the wire.
  effectStrategy: 'input',
  // zod objects strip unknown keys rather than rejecting them. Omitting
  // `additionalProperties` leaves the pydantic models on their default, which
  // is the same: ignore. `false` would forbid what the TypeScript agent
  // accepts, and `true` would keep keys it drops.
  removeAdditionalStrategy: 'strict',
  allowedAdditionalProperties: undefined,
}) as { definitions: Record<string, unknown> };

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'PetraAgentContract',
      definitions: emitted,
    },
    null,
    2
  )}\n`
);
