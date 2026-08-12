import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/frontend/dist/**', '**/Mobile Scanner/**'],
    maxWorkers: 2,
  },
});
