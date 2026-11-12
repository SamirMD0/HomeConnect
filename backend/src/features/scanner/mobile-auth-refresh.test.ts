import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => {
  process.env.JWT_ACCESS_EXPIRY = '2m';
  return {
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      username: 'refresh-fixture',
      fullName: 'Shop Staff',
      role: 'EMPLOYEE',
      isActive: true,
      deletedAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      password: '',
    },
  };
});
vi.unmock('../../lib/user-session-status');
vi.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => fixture.user),
      update: vi.fn(async () => fixture.user),
    },
  },
}));

import { authRoutes } from '../../routes/auth.routes';
import { requireAuth } from '../../middleware/auth.middleware';
import { createMobileApiGateway } from './mobile-api-gateway';

const soak = process.env.MOBILE_AUTH_SOAK === '1';
let desktop: http.Server, lan: http.Server;
let baseUrl: string;
beforeAll(async () => {
  fixture.user.password = await bcrypt.hash('synthetic-password', 4);
  const app = express().use(express.json()).use(cookieParser());
  app.use('/api/v1/auth', authRoutes);
  app.get('/api/v1/system/client-compat', (_req, res) =>
    res.json({ success: true, data: { apiVersion: '2.1.0', minMobileVersion: '1.2.0' } })
  );
  app.get('/api/v1/branches/accessible', requireAuth, (_req, res) =>
    res.json({
      success: true,
      data: [
        { id: '00000000-0000-4000-8000-000000000001', name: 'Beirut' },
        { id: '00000000-0000-4000-8000-000000000002', name: 'Jounieh' },
      ],
    })
  );
  app.get('/api/v1/products/scan', requireAuth, (_req, res) =>
    res.json({
      success: true,
      data: {
        status: 'FOUND',
        normalizedCode: 'HC-000001',
        matchedBy: 'SKU',
        product: {
          id: 'fixture-product',
          name: 'Refresh check product',
          model: 'Test',
          sku: 'HC-000001',
          barcode: null,
          brand: 'Fixture',
          isActive: true,
        },
      },
    })
  );
  app.use(
    (
      error: { statusCode?: number; code?: string; message: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res
        .status(error.statusCode ?? 500)
        .json({ success: false, error: { code: error.code, message: error.message } });
    }
  );
  desktop = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    desktop.once('error', reject);
    desktop.listen(soak ? 3001 : 0, '127.0.0.1', resolve);
  });
  lan = http.createServer(
    express().use(createMobileApiGateway((desktop.address() as { port: number }).port))
  );
  await new Promise<void>((resolve, reject) => {
    lan.once('error', reject);
    lan.listen(soak ? 3011 : 0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${(lan.address() as { port: number }).port}`;
});
afterAll(async () => {
  for (const server of [lan, desktop])
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('unchanged desktop auth through the LAN token bridge', () => {
  it('logs in, renews an expired access JWT using the stored header, and rejects a bad refresh token', async () => {
    const login = await request(baseUrl)
      .post('/api/v1/auth/login')
      .send({ username: fixture.user.username, password: 'synthetic-password' });
    expect(login.status).toBe(200);
    const refreshToken = login.headers['x-refresh-token'];
    expect(refreshToken).toBeTruthy();
    expect(login.headers['set-cookie']).toBeUndefined();
    const payload = jwt.decode(login.body.data.accessToken) as { exp: number; iat: number };
    expect(payload.exp - payload.iat).toBe(120);
    const expired = jwt.sign(
      { userId: fixture.user.id, role: fixture.user.role },
      process.env.JWT_SECRET!,
      { expiresIn: -1 }
    );
    const refreshed = await request(baseUrl)
      .post('/api/v1/auth/refresh')
      .set('Authorization', `Bearer ${expired}`)
      .set('X-Refresh-Token', refreshToken);
    expect(refreshed.status).toBe(200);
    expect(refreshed.headers['x-refresh-token']).toBeTruthy();
    expect(refreshed.headers['cache-control']).toBe('no-store');
    expect(refreshed.headers['set-cookie']).toBeUndefined();
    const me = await request(baseUrl)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshed.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.id).toBe(fixture.user.id);
    const rejected = await request(baseUrl)
      .post('/api/v1/auth/refresh')
      .set('Authorization', `Bearer ${expired}`)
      .set('X-Refresh-Token', 'invalid-refresh');
    expect(rejected.status).toBe(401);
    expect(rejected.headers['x-refresh-token']).toBeUndefined();
    const desktopLogin = await request(desktop)
      .post('/api/v1/auth/login')
      .send({ username: fixture.user.username, password: 'synthetic-password' });
    expect(desktopLogin.headers['set-cookie']).toBeTruthy();
    expect(desktopLogin.headers['x-refresh-token']).toBeUndefined();
  });

  it.skipIf(!soak)(
    'keeps the app UI signed in after three real minutes through :3011 with 2m access tokens',
    async () => {
      const { chromium, expect: browserExpect } = await import('@playwright/test');
      const browser = await chromium.launch({
        executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
        headless: true,
      });
      const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
      const calls: { path: string; status: number }[] = [];
      try {
        // The production app is native. This browser-only adapter supplies CORS
        // while every auth request still reaches the real local HTTP gateway.
        await context.route('**/api/v1/**', async (route) => {
          const headers = {
            'access-control-allow-origin': 'http://localhost:8087',
            'access-control-allow-credentials': 'true',
            'access-control-allow-headers': '*',
            'access-control-allow-methods': 'GET,POST,OPTIONS',
            'access-control-expose-headers': 'X-Refresh-Token',
          };
          if (route.request().method() === 'OPTIONS')
            return route.fulfill({ status: 204, headers });
          const response = await route.fetch();
          calls.push({ path: new URL(route.request().url()).pathname, status: response.status() });
          await route.fulfill({ response, headers: { ...response.headers(), ...headers } });
        });
        const page = await context.newPage();
        await browserExpect
          .poll(
            async () => {
              try {
                return (await fetch('http://localhost:8087', { signal: AbortSignal.timeout(2000) }))
                  .ok;
              } catch {
                return false;
              }
            },
            { timeout: 180_000, intervals: [1000] }
          )
          .toBe(true);
        await page.goto('http://localhost:8087', {
          waitUntil: 'domcontentloaded',
          timeout: 180_000,
        });
        await browserExpect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible(
          { timeout: 180_000 }
        );
        await page.getByLabel('Username', { exact: true }).fill(fixture.user.username);
        await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        await page.getByRole('button', { name: 'Beirut', exact: true }).click();
        await browserExpect(page.getByText('Hello, Shop Staff', { exact: true })).toBeVisible();
        const started = Date.now();
        console.log(
          'SOAK: signed in through :3011; waiting three real minutes with JWT_ACCESS_EXPIRY=2m.'
        );
        await new Promise((resolve) => setTimeout(resolve, 180_500));
        await page
          .getByRole('button', { name: 'Scan a product from any tab', exact: true })
          .click();
        await page.getByLabel('Barcode or SKU', { exact: true }).fill('HC-000001');
        await page.getByRole('button', { name: 'Look up product', exact: true }).click();
        await browserExpect(page.getByText('Refresh check product', { exact: true })).toBeVisible({
          timeout: 20_000,
        });
        await browserExpect(
          page.getByRole('button', { name: 'Sign in', exact: true })
        ).not.toBeVisible();
        const loginCalls = calls.filter((call) => call.path.endsWith('/auth/login')).length;
        expect(loginCalls).toBe(1);
        expect(
          calls.some((call) => call.path.endsWith('/auth/refresh') && call.status === 200)
        ).toBe(true);
        const output = 'docs/reviews/mobile-erp-foundation';
        await mkdir(output, { recursive: true });
        await page.screenshot({ path: `${output}/refresh-after-three-minutes.png` });
        await writeFile(
          `${output}/refresh-soak.json`,
          JSON.stringify(
            {
              accessExpiry: '2m',
              elapsedMs: Date.now() - started,
              gateway: '127.0.0.1:3011',
              desktop: '127.0.0.1:3001',
              loginCalls,
              productVisible: true,
              loginScreenVisible: false,
              calls,
              limitations:
                'Chrome source-copy preview; SecureStore/FileSystem and database user fixture in memory; real desktop controller/service/JWT, gateway and mobile session code; no phone/APK.',
            },
            null,
            2
          )
        );
      } finally {
        await browser.close();
      }
    },
    600_000
  );
});
