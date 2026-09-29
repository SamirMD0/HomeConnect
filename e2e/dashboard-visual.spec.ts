import path from 'path';
import fs from 'fs';
import { test, expect, login } from './support';

const evidenceDir = path.resolve(__dirname, '../.claude/pre-release-audit/evidence/dashboard-visual');

test.beforeAll(() => {
  fs.mkdirSync(evidenceDir, { recursive: true });
});

test('dashboard visual QA', async ({ page }) => {
  await login(page);
  await page.goto('/#/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  // Give charts a beat to draw.
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(evidenceDir, '01-viewport-after.png'), fullPage: false });
  await page.screenshot({ path: path.join(evidenceDir, '02-full-page-after.png'), fullPage: true });
});
