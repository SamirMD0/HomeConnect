import fs from 'fs';
import path from 'path';
import { test as base, expect, Page, APIRequestContext } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

export const state = JSON.parse(
  fs.readFileSync(path.resolve('e2e/.runtime/databases.json'), 'utf8')
);
if (!/^hc_audit_test_browser_\d+$/.test(new URL(state.urls.browser).pathname.slice(1)))
  throw new Error('E2E requires a newly provisioned isolated audit database');
export const password = 'Audit-only-password-2026!';
export const apiOrigin = 'http://127.0.0.1:4311/api/v1';
export const db = new PrismaClient({ datasources: { db: { url: state.urls.browser } } });
export const test = base.extend<{ diagnostics: string[] }>({
  diagnostics: [
    async ({ page }, use, info) => {
      const errors: string[] = [];
      // Auth bootstrap deliberately asks for a refresh before login (401); this is
      // the sole expected browser resource error, not a blanket console waiver.
      page.on('console', (msg) => {
        if (
          msg.type() === 'error' &&
          !(msg.location().url.includes('/auth/refresh') && msg.text().includes('401'))
        )
          errors.push(`console.error: ${msg.text()} ${msg.location().url}`);
      });
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      page.on('requestfailed', (request) => {
        if (request.failure()?.errorText !== 'net::ERR_ABORTED')
          errors.push(
            `requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText}`
          );
      });
      page.on('response', (response) => {
        if (response.status() >= 500)
          errors.push(
            `HTTP ${response.status()}: ${response.request().method()} ${response.url()}`
          );
      });
      await use(errors);
      await info.attach('browser-diagnostics', {
        body: Buffer.from(JSON.stringify(errors, null, 2)),
        contentType: 'application/json',
      });
      expect(errors, 'Unexpected browser errors (see diagnostic attachment)').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
export async function login(page: Page) {
  await page.goto('/#/login');
  await page.getByPlaceholder('Enter your username').fill('audit_admin');
  await page.locator('input[name=password]').fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
export async function api(request: APIRequestContext) {
  const response = await request.post(`${apiOrigin}/auth/login`, {
    data: { username: 'audit_admin', password },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const token = body.data.accessToken;
  if (!token) throw new Error('Login response did not provide accessToken');
  return async (method: string, route: string, data?: unknown) => {
    const r = await request.fetch(`${apiOrigin}${route}`, {
      method,
      data,
      headers: { Authorization: `Bearer ${token}` },
    });
    const b = await r.json();
    expect(r.ok(), `${method} ${route}: ${JSON.stringify(b)}`).toBeTruthy();
    return b.data;
  };
}
