import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@framers/agentos': path.resolve(__dirname, '../../../../../agentos/src'),
    },
  },
});
