// Metro config for a pnpm workspace monorepo.
// pnpm hoists dependencies into a symlinked `.pnpm` store rather than a flat
// node_modules tree, so Metro's default resolver (which assumes npm/yarn
// layout and doesn't follow symlinks) can't find workspace packages like
// @petra/shared or the hoisted root node_modules without this config.
// See: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch only what the mobile app actually needs from the monorepo: its own
// package (implicit default) and the shared workspace package it imports as
// @petra/shared, plus the hoisted root node_modules. NOT the whole repo —
// services/, apps/web, .git, docker/, docs/ etc. are irrelevant
// to this app and watching them needlessly multiplies the crawl on a
// non-native-filesystem volume (see the AppleDouble note below).
config.watchFolders = [
  path.resolve(workspaceRoot, 'packages/shared'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Resolve modules from this package first, then the workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// pnpm's node_modules are symlinks into its content-addressable store.
config.resolver.unstable_enableSymlinks = true;
config.resolver.disableHierarchicalLookup = true;

// This repo lives on a non-native-filesystem volume (/Volumes/...), which
// makes macOS scatter AppleDouble sidecar files (._foo.tsx, .__layout.tsx)
// next to real ones. Metro tries to parse them as source and crashes on
// their binary content — block them from ever being watched/resolved.
config.resolver.blockList = [/\/\.(_|__)[^/]+$/];

module.exports = config;
