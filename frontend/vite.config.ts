import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@frontend': path.resolve(__dirname, './src'),
      '@backend': path.resolve(__dirname, '../backend/src'),
      '@desktop': path.resolve(__dirname, '../desktop/src'),
    },
  },
  server: {
    port: 3000,
  },
  base: './',
});
