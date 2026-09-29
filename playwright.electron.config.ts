import { defineConfig } from '@playwright/test';
export default defineConfig({
  // Covers executable cold launch plus the unchanged 45s application deadline,
  // two process launches in the restart scenario and cleanup/trace capture.
  testDir: './e2e',
  testMatch: 'electron.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 150000,
  expect: { timeout: 15000 },
  outputDir: 'test-results-electron',
  reporter: [
    ['list'],
    ['json', { outputFile: '.claude/pre-release-audit/evidence/electron.json' }],
  ],
});
