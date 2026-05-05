import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
  test: {
    environment: 'node',
    // tests/unit holds fast pure-function tests run on every PR.
    // tests/integration is reserved for the existing slower DB-backed suite.
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    hookTimeout: 60000,
    testTimeout: 60000,
  },
});
