import { defineConfig } from 'vitest/config';
import path from 'path';
import fs from 'fs';

// CI layout: agentos cloned into packages/agentos/ inside this repo
const ciPath = path.resolve(__dirname, '../../../../packages/agentos/src');
// Monorepo layout: agentos is a sibling at packages/agentos/
const monoPath = path.resolve(__dirname, '../../../../../agentos/src');

const agentosPath = fs.existsSync(ciPath) ? ciPath : fs.existsSync(monoPath) ? monoPath : null;

/**
 * Native C++ addons (better-sqlite3) cannot be transformed by Vite.
 * When @framers/agentos is resolved from source, transitive imports
 * of SqliteBrain pull in better-sqlite3 — mark it external.
 */
const NATIVE_EXTERNALS = ['better-sqlite3'];

export default defineConfig({
  server: { deps: { external: NATIVE_EXTERNALS } },
  ssr: { external: NATIVE_EXTERNALS },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    testTimeout: 10000,
    server: { deps: { external: NATIVE_EXTERNALS } },
  },
  resolve: agentosPath ? {
    alias: {
      '@framers/agentos': agentosPath,
    },
  } : {},
});
