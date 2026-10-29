import http from 'node:http';
import type { Express } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { productsMock } = vi.hoisted(() => ({ productsMock: { scanLookup: vi.fn() } }));
vi.mock('../service/products/products.service', () => ({ ProductsService: productsMock }));
vi.mock('../../lib/prisma', () => ({ prisma: { $queryRaw: vi.fn() }, transactionModel: {}, activityLogModel: {} }));

import { buildLanApp } from './lan-listener';
import { resetRateLimits } from './scanner-rate-limit';
import { ScannerService } from './scanner.service';
import { scannerStore } from './scanner.store';
import { AuthService } from '../../services/auth.service';
import { app as mainApp } from '../../app';

// The LAN gateway forwards mobile requests over HTTP to the desktop API on
// 127.0.0.1:PORT. Run the real main app on a free port so forwarded requests
// still pass through its auth, role and handler code.
let app: Express;
let desktop: http.Server;
beforeAll(async () => {
  desktop = http.createServer(mainApp);
  await new Promise<void>((resolve) => desktop.listen(0, '127.0.0.1', resolve));
  process.env.PORT = String((desktop.address() as { port: number }).port);
  app = buildLanApp();
});
afterAll(async () => {
  await new Promise<void>((resolve) => desktop.close(() => resolve()));
});

const foundResult = {
  status: 'FOUND',
  normalizedCode: 'HC-000001',
  matchedBy: 'SKU',
  product: {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Ceiling Fan',
    model: 'CF-52',
    sku: 'HC-000001',
    barcode: null,
    brand: 'Toshiba',
    isActive: true,
  },
};

const issueCode = () => ScannerService.createPairingCode('11111111-1111-4111-8111-111111111111').code;

const pairPhone = async () => {
  const response = await request(app).post('/api/v1/scanner/pair').send({ code: issueCode(), deviceLabel: 'Shop phone' });
  return response.body.data.token as string;
};

beforeEach(() => {
  scannerStore.reset();
  resetRateLimits();
  vi.clearAllMocks();
  productsMock.scanLookup.mockResolvedValue(foundResult);
});

describe('LAN surface', () => {
  it('does not expose desktop-only API routes', async () => {
    const forbidden = [
      '/api/v1/customers',
      '/api/v1/debts',
      '/api/v1/payments',
      '/api/v1/sales-orders',
      '/api/v1/financial-ledger',
      '/api/v1/admin/backups',
      '/api/v1/admin/maintenance',
      '/api/v1/admin/diagnostics/health',
      '/api/v1/system/local-status',
      '/api/v1/scanner/sessions',
      '/api/v1/scanner/events/recent',
      '/api/v1/scanner/pairing-code',
      '/api/v1/auth/login',
      '/api/v1/health',
    ];
    for (const path of forbidden) {
      expect((await request(app).get(path)).status, `GET ${path}`).toBe(404);
    }
    expect((await request(app).post('/api/v1/products').send({})).status).toBe(404);
    expect((await request(app).post('/api/v1/suppliers').send({})).status).toBe(404);
    expect((await request(app).get('/api/v1/suppliers/not-a-uuid/purchases')).status).toBe(404);
    const adminToken = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, process.env.JWT_SECRET!);
    expect((await request(app).get('/api/v1/customers').set('Authorization', `Bearer ${adminToken}`)).status).toBe(404);
  });

  it('leaves allowed mobile routes unmounted without a bearer token', async () => {
    // No JWT: the gateway never forwards, so the routes do not exist on the LAN.
    expect((await request(app).get('/api/v1/products')).status).toBe(404);
    expect((await request(app).get('/api/v1/suppliers')).status).toBe(404);
    expect((await request(app).get('/api/v1/supplier-ledger')).status).toBe(404);
    expect((await request(app).post('/api/v1/suppliers/11111111-1111-4111-8111-111111111111/purchases').send({})).status).toBe(404);
    // A scanner pairing token cannot authorize this surface.
    const scannerToken = await pairPhone();
    expect((await request(app).get('/api/v1/suppliers').set('x-scanner-session', scannerToken)).status).toBe(404);
  }, 20_000);

  it('forwards a bad bearer token to the desktop, which rejects it', async () => {
    expect((await request(app).get('/api/v1/suppliers').set('Authorization', 'Bearer not-a-jwt')).status).toBe(401);
  }, 20_000);

  it('accepts account login without exposing a refresh cookie on the LAN', async () => {
    const loginMock = vi.spyOn(AuthService, 'login').mockResolvedValue({
      user: { id: '11111111-1111-4111-8111-111111111111', username: 'admin', fullName: 'Admin', role: 'ADMIN' },
      accessToken: 'access', refreshToken: 'refresh',
    } as never);
    try {
      const response = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'secret' });
      expect(response.status).toBe(200);
      expect(response.body.data.accessToken).toBe('access');
      expect(response.headers['set-cookie']).toBeUndefined();
    } finally {
      loginMock.mockRestore();
    }
  }, 20_000);

  it('forwards authenticated barcode lookups to the main product handler', async () => {
    const token = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'EMPLOYEE' }, process.env.JWT_SECRET!);
    const response = await request(app).get('/api/v1/products/scan?code=HC-000001').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(foundResult);
    expect(productsMock.scanLookup).toHaveBeenCalledWith({ code: 'HC-000001' });
  }, 20_000);

  it('refuses an oversized body as a client error, not a server fault', async () => {
    const response = await request(app)
      .post('/api/v1/scanner/pair')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ code: '000000', deviceLabel: 'x'.repeat(20_000) }));
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('refuses malformed JSON as a client error', async () => {
    const response = await request(app)
      .post('/api/v1/scanner/pair')
      .set('Content-Type', 'application/json')
      .send('{"code": ');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });
});

describe('mobile scanner page', () => {
  it('serves a self-contained page with a nonce-based policy', async () => {
    const response = await request(app).get('/mobile-scanner');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');

    const csp = response.headers['content-security-policy'];
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain('unsafe-inline');

    const nonce = /script-src 'nonce-([A-Za-z0-9_-]+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(response.text).toContain(`<script nonce="${nonce}">`);
    expect(response.text).toContain(`<style nonce="${nonce}">`);
  });

  it('uses a different nonce on every response', async () => {
    const first = (await request(app).get('/mobile-scanner')).headers['content-security-policy'];
    const second = (await request(app).get('/mobile-scanner')).headers['content-security-policy'];
    expect(first).not.toBe(second);
  });

  it('loads nothing from outside the PC', async () => {
    const { text } = await request(app).get('/mobile-scanner');
    expect(text).not.toMatch(/src="https?:\/\//);
    expect(text).not.toMatch(/href="https?:\/\//);
  });

  it('is not cached, so a stale page cannot outlive a session', async () => {
    const response = await request(app).get('/mobile-scanner');
    expect(response.headers['cache-control']).toContain('no-store');
  });
});

describe('LAN pairing', () => {
  it('exchanges a valid code for a token', async () => {
    const response = await request(app).post('/api/v1/scanner/pair').send({ code: issueCode(), deviceLabel: 'Shop phone' });
    expect(response.status).toBe(201);
    expect(response.body.data.token).toBeTruthy();
    expect(response.body.data.deviceLabel).toBe('Shop phone');
  });

  it('never returns the session id, which is the admin revoke handle', async () => {
    const response = await request(app).post('/api/v1/scanner/pair').send({ code: issueCode() });
    expect(Object.keys(response.body.data).sort()).toEqual(['deviceLabel', 'expiresAt', 'token']);
  });

  it('names an unlabelled device rather than rejecting it', async () => {
    const response = await request(app).post('/api/v1/scanner/pair').send({ code: issueCode() });
    expect(response.status).toBe(201);
    expect(response.body.data.deviceLabel).toBe('Phone scanner');
  });

  it('answers a wrong code and a malformed code identically', async () => {
    issueCode();
    const wrong = await request(app).post('/api/v1/scanner/pair').send({ code: '000001' });
    const malformed = await request(app).post('/api/v1/scanner/pair').send({ code: 'abcdef' });
    expect(wrong.status).toBe(401);
    expect(malformed.status).toBe(401);
    expect(wrong.body.error.message).toBe(malformed.body.error.message);
  });

  it('rate limits pairing attempts', async () => {
    issueCode();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app).post('/api/v1/scanner/pair').send({ code: '000001' });
    }
    expect((await request(app).post('/api/v1/scanner/pair').send({ code: '000001' })).status).toBe(429);
  });
});

describe('LAN scan events', () => {
  const scan = (token: string | null, code = 'HC-000001') => {
    const call = request(app).post('/api/v1/scanner/events');
    if (token) call.set('X-Scanner-Session', token);
    return call.send({ code });
  };

  it('requires a scanner session', async () => {
    expect((await scan(null)).status).toBe(401);
    expect(productsMock.scanLookup).not.toHaveBeenCalled();
  });

  it('rejects a JWT, which is not a scanner session', async () => {
    const response = await request(app)
      .post('/api/v1/scanner/events')
      .set('Authorization', 'Bearer looks-like-a-user-token')
      .send({ code: 'HC-000001' });
    expect(response.status).toBe(401);
  });

  it('looks the code up server-side and returns the minimal payload', async () => {
    const token = await pairPhone();
    const response = await scan(token);
    expect(response.status).toBe(200);
    expect(productsMock.scanLookup).toHaveBeenCalledWith({ code: 'HC-000001' });
    expect(response.body.data.product).toEqual(foundResult.product);
  });

  /**
   * The phone can say what it scanned, never what it matched.
   */
  it('ignores any status or product the phone tries to assert', async () => {
    const token = await pairPhone();
    productsMock.scanLookup.mockResolvedValue({ status: 'NOT_FOUND', normalizedCode: 'HC-999999', matchedBy: null, product: null });
    const response = await request(app)
      .post('/api/v1/scanner/events')
      .set('X-Scanner-Session', token)
      .send({ code: 'HC-999999', status: 'FOUND', productId: '33333333-3333-4333-8333-333333333333' });
    expect(response.body.data.status).toBe('NOT_FOUND');
    expect(response.body.data.product).toBeNull();
  });

  it('never sends pricing, cost, or stock to the phone', async () => {
    const token = await pairPhone();
    const body = JSON.stringify((await scan(token)).body);
    for (const forbidden of ['price', 'costPrice', 'netPrice', 'discount', 'stockQuantity', 'trackStock', 'internalPriceCode', 'pricing', 'specifications', 'notes']) {
      expect(body, forbidden).not.toContain(forbidden);
    }
  });

  it('records the scan as phone-sourced and attributes it to the session', async () => {
    const token = await pairPhone();
    await scan(token);
    const { events } = ScannerService.recentEvents(0);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ source: 'PHONE_SCANNER', code: 'HC-000001', status: 'FOUND' });
    expect(events[0].sessionId).toBeTruthy();
  });

  it('stops working the moment the session is revoked', async () => {
    const token = await pairPhone();
    expect((await scan(token)).status).toBe(200);
    const [session] = ScannerService.listSessions();
    ScannerService.revokeSession(session.id);
    expect((await scan(token)).status).toBe(401);
  });

  it('rejects a body without a code', async () => {
    const token = await pairPhone();
    expect((await request(app).post('/api/v1/scanner/events').set('X-Scanner-Session', token).send({})).status).toBe(400);
  });
});

describe('LAN session heartbeat', () => {
  it('confirms a live session without exposing the token', async () => {
    const token = await pairPhone();
    const response = await request(app).get('/api/v1/scanner/session').set('X-Scanner-Session', token);
    expect(response.status).toBe(200);
    expect(Object.keys(response.body.data).sort()).toEqual(['deviceLabel', 'expiresAt']);
    expect(JSON.stringify(response.body)).not.toContain(token);
  });

  it('refuses an unknown session', async () => {
    expect((await request(app).get('/api/v1/scanner/session').set('X-Scanner-Session', 'nope')).status).toBe(401);
  });
});
