import path from 'path';
import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so app build config stays independent of test setup.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    // Use node environment: jsdom 30 + undici crashes on Node 20
    // (webidl.util.markAsUncloneable is not a function).
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    pool: 'forks',
  },
});
