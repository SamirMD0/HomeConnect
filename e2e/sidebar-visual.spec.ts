import path from 'path';
import fs from 'fs';
import { test, expect, login } from './support';

// One-off visual QA for the redesigned sidebar. Captures expanded, collapsed
// and Arabic-subtitle screenshots against the isolated audit browser DB and
// stores them under evidence/. Kept as its own spec so it stays out of the
// critical path and can be run standalone with:
//   npx playwright test e2e/sidebar-visual.spec.ts

const evidenceDir = path.resolve(__dirname, '../.claude/pre-release-audit/evidence/sidebar-visual');

test.beforeAll(() => {
  fs.mkdirSync(evidenceDir, { recursive: true });
});

test('sidebar visual QA: expanded, collapsed, active state, employee', async ({ page }) => {
  await login(page);

  // 1. Expanded, ADMIN, on /products so a nested-route active state shows.
  await page.goto('/#/products');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('navigation', { name: /Primary navigation/i })).toBeVisible();
  await page.locator('aside').screenshot({ path: path.join(evidenceDir, '01-expanded-admin.png') });

  // 2. Collapsed via the sidebar chevron.
  await page.getByRole('button', { name: 'Collapse navigation' }).first().click();
  await page.waitForTimeout(250); // let the width transition settle
  await page.locator('aside').screenshot({ path: path.join(evidenceDir, '02-collapsed-admin.png') });
  await page.getByRole('button', { name: 'Expand navigation' }).first().click();
  await page.waitForTimeout(250);

  // 3. Focus the second nav item to snapshot the focus-visible state.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.locator('aside').screenshot({ path: path.join(evidenceDir, '03-focus-visible.png') });

  // 4. Full-viewport screenshot showing sidebar + header + content together.
  await page.screenshot({ path: path.join(evidenceDir, '04-full-viewport-products.png'), fullPage: false });
});
