import { defineConfig } from 'vitest/config';
import path from 'path';
import fs from 'fs';

const ciPath = path.resolve(__dirname, '../../../../packages/agentos/src');
const monoPath = path.resolve(__dirname, '../../../../../agentos/src');
const agentosPath = fs.existsSync(ciPath) ? ciPath : fs.existsSync(monoPath) ? monoPath : null;

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    testTimeout: 10000,
  },
  resolve: agentosPath ? {
    alias: { '@framers/agentos': agentosPath },
  } : {},
});
