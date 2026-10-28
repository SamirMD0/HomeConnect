import http from 'node:http';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMobileApiGateway } from './mobile-api-gateway';

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
      res.setHeader('Set-Cookie', 'secret=must-not-forward');
      res.statusCode = req.url?.includes('denied') ? 403 : 200;
      res.end(JSON.stringify({ headers: req.headers, path: req.url, body: Buffer.concat(chunks).toString('hex') }));
    });
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  app = express().use(createMobileApiGateway((upstream.address() as { port: number }).port));
});
afterAll(async () => { await new Promise<void>((resolve) => upstream.close(() => resolve())); });

describe('mobile JWT gateway', () => {
  it('allows GET branches/accessible and preserves the selected branch header unchanged', async () => {
    const response = await request(app).get('/api/v1/branches/accessible').set('Authorization', 'Bearer jwt').set('X-Branch-Scope', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA');
    expect(response.status).toBe(200);
    expect(response.body.headers['x-branch-scope']).toBe('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA');
    expect(response.body.headers.authorization).toBe('Bearer jwt');
    expect(response.headers['set-cookie']).toBeUndefined();
  });
  it('forwards supplier JSON and raw receipt uploads with scope, without cookies or scanner credentials', async () => {
    const path = '/api/v1/supplier-purchases/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/receipts';
    const response = await request(app).post(path).set('Authorization', 'Bearer jwt').set('X-Branch-Scope', 'all').set('Cookie', 'secret=1').set('X-Scanner-Session', 'scanner-only').set('Content-Type', 'image/jpeg').send(Buffer.from([1, 2, 255]));
    expect(response.body.body).toBe('0102ff');
    expect(response.body.headers['x-branch-scope']).toBe('all');
    expect(response.body.headers.cookie).toBeUndefined();
    expect(response.body.headers['x-scanner-session']).toBeUndefined();
    const json = await request(app).post('/api/v1/auth/login').send({ email: 'a', password: 'b' });
    expect(Buffer.from(json.body.body, 'hex').toString()).toBe(JSON.stringify({ email: 'a', password: 'b' }));
  });
  it('preserves a branch denial response from the desktop', async () => {
    expect((await request(app).get('/api/v1/suppliers?denied').set('Authorization', 'Bearer jwt')).status).toBe(403);
  });
  it('does not expose unlisted methods, sibling branch routes, or traversal paths', async () => {
    const before = calls;
    for (const path of ['/api/v1/branches', '/api/v1/branches/accessible/extra', '/api/v1/customers', '/api/v1/scanner/sessions', '/api/v1/suppliers/%2e%2e/users']) {
      expect((await request(app).get(path).set('Authorization', 'Bearer jwt')).status).toBe(404);
    }
    expect((await request(app).post('/api/v1/branches/accessible').set('Authorization', 'Bearer jwt')).status).toBe(404);
    expect((await request(app).get('/api/v1/branches/accessible').set('X-Scanner-Session', 'paired')).status).toBe(404);
    expect(calls).toBe(before);
  });
});
