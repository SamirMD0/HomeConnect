import { defineConfig } from 'vitest/config';
import { URL as NodeURL } from 'node:url';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@shared': fileURLToPath(new NodeURL('../shared', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
