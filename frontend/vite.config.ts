import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'fs';

const packageJson = JSON.parse(
  readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')
) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  resolve: {
    alias: {
      '@frontend': path.resolve(__dirname, './src'),
      '@backend': path.resolve(__dirname, '../backend/src'),
      '@desktop': path.resolve(__dirname, '../desktop/src'),
    },
  },
  server: {
    // Pinned to IPv4 loopback on purpose. Vite's default host is `localhost`,
    // which on Windows resolves to ::1 first, so the dev server ends up bound to
    // [::1]:3002 only and http://127.0.0.1:3002 is refused. Everything else in
    // the project addresses it as 127.0.0.1 — desktop/src/runtime-config.ts,
    // the Electron dev launcher's readiness probe, and the backend CORS list —
    // so the server has to actually be there.
    host: '127.0.0.1',
    port: Number(process.env.VITE_PORT || 3002),
    strictPort: true,
  },
  base: './',
});
