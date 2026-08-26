import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/frontend/dist/**', '**/Mobile Scanner/**'],
    maxWorkers: 2,
    setupFiles: ['backend/src/test/setup.ts'],
    env: {
      JWT_SECRET: 'test-only-jwt-secret-at-least-32-characters',
      JWT_REFRESH_SECRET: 'test-only-jwt-refresh-secret-at-least-32-characters',
    },
  },
});
