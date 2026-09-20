import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `logs/` holds captured browser-check artifacts, including bundled Chrome
    // extension sources that ship their own *.test.js / *.spec.js files. Those
    // are third-party and fail collection under vitest, so never pick them up.
    exclude: ['**/node_modules/**', '**/dist/**', '**/frontend/dist/**', '**/Mobile Scanner/**', '**/logs/**'],
    maxWorkers: 2,
  },
});
