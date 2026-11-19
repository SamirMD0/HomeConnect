import { transformWithOxc } from 'vite';
import { defineConfig } from 'vitest/config';

// The cloud end-to-end test imports phone sources. Their tsconfig extends
// expo/tsconfig.base, which CI never installs, so compile them with inline
// options instead of the phone tsconfig.
const phoneSource = /[\\/]Mobile Scanner[\\/].*\.tsx?$/;

export default defineConfig({
  oxc: { exclude: [phoneSource] },
  plugins: [
    {
      name: 'phone-sources-without-expo-tsconfig',
      enforce: 'pre',
      transform(code, id) {
        if (!phoneSource.test(id)) return null;
        return transformWithOxc(code, id, {
          tsconfig: { compilerOptions: { target: 'ES2022', useDefineForClassFields: true, jsx: 'react-jsx' } },
        } as Parameters<typeof transformWithOxc>[2]);
      },
    },
  ],
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
