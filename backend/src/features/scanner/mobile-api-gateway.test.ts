import http from 'node:http';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMobileApiGateway, MOBILE_DENIED_PREFIXES } from './mobile-api-gateway';

let upstream: http.Server;
let app: express.Express;
let calls = 0;
beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    calls++;
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Set-Cookie', [
        'secret=must-not-forward; HttpOnly',
        'refreshToken=rotated-refresh.jwt.value; Path=/; HttpOnly; SameSite=Lax',
      ]);
      res.setHeader('Cache-Control', 'public, max-age=100');
      res.setHeader('X-Refresh-Token', 'untrusted-upstream-header');
      res.statusCode = req.url?.includes('denied') ? 403 : 200;
      res.end(
        JSON.stringify({
          headers: req.headers,
          path: req.url,
          body: Buffer.concat(chunks).toString('hex'),
        })
      );
    });
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  app = express().use(createMobileApiGateway((upstream.address() as { port: number }).port));
});
afterAll(async () => {
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

describe('mobile JWT gateway', () => {
  it.each(['/api/v1/auth/login', '/api/v1/auth/refresh'])(
    'translates only the named refresh cookie on POST %s and prevents caching',
    async (path) => {
      const response = await request(app).post(path).set('Authorization', 'Bearer jwt');
      expect(response.headers['x-refresh-token']).toBe('rotated-refresh.jwt.value');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.headers['cache-control']).toBe('no-store');
    }
  );
  it.each(['/api/v1/auth/refresh', '/api/v1/auth/logout'])(
    'translates the phone header into exactly one cookie on POST %s',
    async (path) => {
      const response = await request(app)
        .post(path)
        .set('Authorization', 'Bearer expired-jwt')
        .set('X-Refresh-Token', 'stored-refresh.jwt.value')
        .set('Cookie', 'refreshToken=attacker; other=secret');
      expect(response.body.headers.cookie).toBe('refreshToken=stored-refresh.jwt.value');
      expect(response.body.headers['x-refresh-token']).toBeUndefined();
      expect(response.headers['set-cookie']).toBeUndefined();
      if (path.endsWith('logout')) expect(response.headers['x-refresh-token']).toBeUndefined();
    }
  );
  it.each([
    ['post', '/api/v1/auth/login'],
    ['get', '/api/v1/auth/refresh'],
    ['get', '/api/v1/auth/logout'],
    ['post', '/api/v1/auth/refresh/other'],
    ['post', '/api/v1/customers'],
    ['get', '/api/v1/products'],
  ] as const)('drops phone cookies and the refresh header for %s %s', async (method, path) => {
    const client = request(app);
    const response = await client[method](path)
      .set('Authorization', 'Bearer jwt')
      .set('X-Refresh-Token', 'stored-refresh')
      .set('Cookie', 'refreshToken=attacker; secret=other');
    expect(response.body.headers.cookie).toBeUndefined();
    expect(response.body.headers['x-refresh-token']).toBeUndefined();
    expect(response.headers['set-cookie']).toBeUndefined();
    if (!(method === 'post' && path.endsWith('/login')))
      expect(response.headers['x-refresh-token']).toBeUndefined();
  });
  it('never falls back to a phone cookie and refuses cookie injection in the token header', async () => {
    for (const token of [null, 'refresh; injected=secret', 'refresh,other', 'refresh token']) {
      const call = request(app)
        .post('/api/v1/auth/refresh')
        .set('Authorization', 'Bearer jwt')
        .set('Cookie', 'refreshToken=attacker');
      if (token) call.set('X-Refresh-Token', token);
      expect((await call).body.headers.cookie).toBeUndefined();
    }
  });
  it('allows GET branches/accessible and preserves the selected branch header unchanged', async () => {
    const response = await request(app)
      .get('/api/v1/branches/accessible')
      .set('Authorization', 'Bearer jwt')
      .set('X-Branch-Scope', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA');
    expect(response.status).toBe(200);
    expect(response.body.headers['x-branch-scope']).toBe('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA');
    expect(response.body.headers.authorization).toBe('Bearer jwt');
    expect(response.headers['set-cookie']).toBeUndefined();
  });
  it('forwards supplier JSON and raw receipt uploads with scope, without cookies or scanner credentials', async () => {
    const path = '/api/v1/supplier-purchases/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/receipts';
    const response = await request(app)
      .post(path)
      .set('Authorization', 'Bearer jwt')
      .set('X-Branch-Scope', 'all')
      .set('X-Receipt-Id', '11111111-1111-4111-8111-111111111111')
      .set('Cookie', 'secret=1')
      .set('X-Scanner-Session', 'scanner-only')
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from([1, 2, 255]));
    expect(response.body.body).toBe('0102ff');
    expect(response.body.headers['x-branch-scope']).toBe('all');
    expect(response.body.headers['x-receipt-id']).toBe('11111111-1111-4111-8111-111111111111');
    expect(response.body.headers.cookie).toBeUndefined();
    expect(response.body.headers['x-scanner-session']).toBeUndefined();
    const json = await request(app).post('/api/v1/auth/login').send({ email: 'a', password: 'b' });
    expect(Buffer.from(json.body.body, 'hex').toString()).toBe(
      JSON.stringify({ email: 'a', password: 'b' })
    );
  });
  it('forwards all bill routes and purchase receipt listing with exact methods', async () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const cases = [
      ['post', `/api/v1/suppliers/${id}/bills?note=Page%201`],
      ['get', `/api/v1/suppliers/${id}/bills?linked=false`],
      ['patch', `/api/v1/supplier-bills/${id}`],
      ['delete', `/api/v1/supplier-bills/${id}`],
      ['get', `/api/v1/supplier-bills/${id}/image`],
      ['get', `/api/v1/supplier-purchases/${id}/receipts`],
    ] as const;
    for (const [method, path] of cases) {
      const client = request(app);
      const response = await client[method](path)
        .set('Authorization', 'Bearer jwt')
        .set('X-Branch-Scope', id);
      expect(response.status).toBe(200);
      expect(response.body.path).toBe(path);
      expect(response.body.headers['x-branch-scope']).toBe(id);
    }
  });
  it('forwards arbitrary desktop business routes and caching/request identifiers', async () => {
    const response = await request(app)
      .get('/api/v1/customers?page=2')
      .set('Authorization', 'Bearer jwt')
      .set('X-Request-Id', 'request-1')
      .set('If-None-Match', 'etag-1');
    expect(response.status).toBe(200);
    expect(response.body.path).toBe('/api/v1/customers?page=2');
    expect(response.body.headers['x-request-id']).toBe('request-1');
    expect(response.body.headers['if-none-match']).toBe('etag-1');
  });
  it.each(MOBILE_DENIED_PREFIXES)(
    'denies desktop-only prefix %s with no upstream request',
    async (prefix) => {
      const before = calls;
      const response = await request(app)
        .get(prefix + '/operation')
        .set('Authorization', 'Bearer jwt');
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('NOT_AVAILABLE_ON_MOBILE');
      expect(calls).toBe(before);
    }
  );
  it('exposes only GET client compatibility publicly under the system prefix', async () => {
    expect((await request(app).get('/api/v1/system/client-compat')).status).toBe(200);
    expect(
      (await request(app).post('/api/v1/system/client-compat').set('Authorization', 'Bearer jwt'))
        .status
    ).toBe(403);
    expect(
      (
        await request(app)
          .get('/api/v1/system/client-compat/extra')
          .set('Authorization', 'Bearer jwt')
      ).status
    ).toBe(403);
  });
  it('preserves a branch denial response from the desktop', async () => {
    expect(
      (await request(app).get('/api/v1/suppliers?denied').set('Authorization', 'Bearer jwt')).status
    ).toBe(403);
  });
  it('leaves no-token business GETs inaccessible, while login needs no token', async () => {
    const before = calls;
    expect((await request(app).get('/api/v1/customers')).status).toBe(404);
    expect(
      (await request(app).get('/api/v1/customers').set('X-Scanner-Session', 'paired')).status
    ).toBe(404);
    expect(calls).toBe(before);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login')
          .send({ username: 'staff', password: 'synthetic' })
      ).status
    ).toBe(200);
  });
  it('rejects normalized and encoded traversal attempts without forwarding', async () => {
    const before = calls;
    for (const path of [
      '/api/v1/../backup',
      '/api/v1/%2e%2e/backup',
      '/api/v1/%252e%252e/backup',
      '/api/v1/admin/%62ackups',
      '/api/v1/customers/%5c../admin/backups',
    ]) {
      expect((await request(app).get(path).set('Authorization', 'Bearer jwt')).status).toBe(403);
    }
    expect(calls).toBe(before);
  });
});
