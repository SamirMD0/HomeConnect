import { defineConfig } from '@playwright/test';
import path from 'path';
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('e2e/.runtime/browsers');
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 12000 },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: '.claude/pre-release-audit/evidence/playwright.json' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4312',
    channel: 'chrome',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'browser', testIgnore: '**/electron.spec.ts' }],
});
