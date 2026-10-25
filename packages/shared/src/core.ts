/**
 * Everything in @petra/shared that is safe in a React Server Component:
 * design tokens, types and pure utilities — no Zustand stores, no React
 * context, no API client.
 *
 * The root barrel (`@petra/shared`) re-exports the stores, which call
 * `createContext`, so importing a value from it inside a Server Component
 * fails the Next.js build. Server-rendered code imports from here instead:
 *
 *   import { dueLabel } from '@petra/shared/src/core';
 */
export * from './design';
export * from './types';
export * from './utils';
