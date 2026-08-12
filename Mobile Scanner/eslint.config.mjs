import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';

export default defineConfig([
  expoConfig,
  {
    ignores: ['node_modules/**', 'coverage/**'],
    rules: {
      'react-hooks/exhaustive-deps': 'error',
    },
  },
]);
