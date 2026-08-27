import path from 'path';
import { defineConfig } from 'vitest/config';

// Deliberately a separate file from vite.config.ts rather than adding a
// `test` block there, so the app's build config stays untouched by the
// test setup and vice versa.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
