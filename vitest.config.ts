import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['backend/**/*.test.{ts,tsx}', 'frontend/src/**/*.test.{ts,tsx}', 'desktop/**/*.test.{ts,tsx}', 'scripts/**/*.test.{ts,tsx}'],
    // `logs/` holds captured browser-check artifacts, including bundled Chrome
    // extension sources that ship their own *.test.js / *.spec.js files. Those
    // are third-party and fail collection under vitest, so never pick them up.
    exclude: ['**/node_modules/**', '**/dist/**', '**/frontend/dist/**', '**/Mobile Scanner/**', '**/logs/**'],
    maxWorkers: 2,
    setupFiles: ['backend/src/test/setup.ts'],
    env: {
      JWT_SECRET: 'test-only-jwt-secret-at-least-32-characters',
      JWT_REFRESH_SECRET: 'test-only-jwt-refresh-secret-at-least-32-characters',
    },
  },
});
