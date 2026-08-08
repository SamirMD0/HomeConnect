import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({ prismaMock: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) } }));
vi.mock('../../lib/prisma', () => ({ prisma: prismaMock, transactionModel: {}, activityLogModel: {} }));

import { app } from '../../app';
import { resetRateLimits } from './scanner-rate-limit';
import { ScannerService } from './scanner.service';
import { scannerStore } from './scanner.store';

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);

const as = (token: string) => `Bearer ${token}`;

beforeEach(() => {
  scannerStore.reset();
  resetRateLimits();
});

describe('scanner routes: authentication', () => {
  const routes: Array<[string, string]> = [
    ['post', '/api/v1/scanner/pairing-code'],
    ['get', '/api/v1/scanner/sessions'],
    ['post', '/api/v1/scanner/sessions/abc/revoke'],
    ['get', '/api/v1/scanner/events/recent'],
    ['post', '/api/v1/scanner/events'],
  ];

  it('rejects every scanner route without a user token', async () => {
    for (const [method, path] of routes) {
      const response = await (method === 'get' ? request(app).get(path) : request(app).post(path));
      expect(response.status, `${method} ${path}`).toBe(401);
    }
  });

  /**
   * The phone-facing pairing exchange must not exist on the main API: it cannot
   * carry a user token, so mounting it here would mean an unauthenticated route
   * on the loopback app. It arrives only with the LAN listener.
   */
  it('does not expose a pair route on the main API', async () => {
    const response = await request(app).post('/api/v1/scanner/pair').set('Authorization', as(admin)).send({ code: '000000' });
    expect(response.status).toBe(404);
  });
});

describe('scanner routes: LAN control', () => {
  it('lets only an admin enable or disable LAN mode', async () => {
    for (const path of ['/api/v1/scanner/lan/enable', '/api/v1/scanner/lan/disable']) {
      expect((await request(app).post(path).set('Authorization', as(employee))).status).toBe(403);
    }
  });

  it('lets any signed-in user read LAN status', async () => {
    for (const token of [admin, employee]) {
      const response = await request(app).get('/api/v1/scanner/lan-status').set('Authorization', as(token));
      expect(response.status).toBe(200);
      expect(response.body.data.mode).toBe('DISABLED');
    }
  });

  it('reports the port and firewall guidance even while disabled', async () => {
    const response = await request(app).get('/api/v1/scanner/lan-status').set('Authorization', as(employee));
    expect(response.body.data.port).toBe(3011);
    expect(response.body.data.firewall.command).toContain('New-NetFirewallRule');
  });

  it('exposes no addresses while LAN mode is off', async () => {
    const response = await request(app).get('/api/v1/scanner/lan-status').set('Authorization', as(admin));
    expect(response.body.data.addresses).toEqual([]);
    expect(response.body.data.urls).toEqual([]);
  });
});

describe('scanner routes: pairing code', () => {
  it('lets an admin mint a code', async () => {
    const response = await request(app).post('/api/v1/scanner/pairing-code').set('Authorization', as(admin));
    expect(response.status).toBe(201);
    expect(response.body.data.code).toMatch(/^\d{6}$/);
  });

  it('refuses a non-admin', async () => {
    const response = await request(app).post('/api/v1/scanner/pairing-code').set('Authorization', as(employee));
    expect(response.status).toBe(403);
    expect(scannerStore.getPairingCode()).toBeNull();
  });

  it('rate limits minting', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await request(app).post('/api/v1/scanner/pairing-code').set('Authorization', as(admin))).status).toBe(201);
    }
    const limited = await request(app).post('/api/v1/scanner/pairing-code').set('Authorization', as(admin));
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('scanner routes: sessions', () => {
  const pairOne = () => {
    const { code } = ScannerService.createPairingCode('11111111-1111-4111-8111-111111111111');
    return ScannerService.pairScanner({ code, deviceLabel: 'Shop phone', ipAddress: '192.168.1.50' });
  };

  it('lets any signed-in user read the session list', async () => {
    pairOne();
    for (const token of [admin, employee]) {
      const response = await request(app).get('/api/v1/scanner/sessions').set('Authorization', as(token));
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
    }
  });

  it('never leaks a token or its hash through the list', async () => {
    const { token } = pairOne();
    const response = await request(app).get('/api/v1/scanner/sessions').set('Authorization', as(employee));
    const body = JSON.stringify(response.body);
    expect(body).not.toContain(token);
    expect(body).not.toContain('tokenHash');
    expect(body).not.toContain('pairedByUserId');
  });

  it('lets an admin revoke and refuses an employee', async () => {
    const { sessionId } = pairOne();
    expect((await request(app).post(`/api/v1/scanner/sessions/${sessionId}/revoke`).set('Authorization', as(employee))).status).toBe(403);

    const revoked = await request(app).post(`/api/v1/scanner/sessions/${sessionId}/revoke`).set('Authorization', as(admin));
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.isActive).toBe(false);
  });

  it('404s revoking an unknown session', async () => {
    const response = await request(app).post('/api/v1/scanner/sessions/does-not-exist/revoke').set('Authorization', as(admin));
    expect(response.status).toBe(404);
  });
});

describe('scanner routes: events', () => {
  const post = (body: Record<string, unknown>) =>
    request(app).post('/api/v1/scanner/events').set('Authorization', as(employee)).send(body);

  it('records a PC scan and reads it back', async () => {
    const created = await post({ code: 'HC-000001', status: 'FOUND', productId: '33333333-3333-4333-8333-333333333333' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ source: 'PC_SCANNER', code: 'HC-000001', status: 'FOUND' });

    const recent = await request(app).get('/api/v1/scanner/events/recent').set('Authorization', as(employee));
    expect(recent.status).toBe(200);
    expect(recent.body.data.events).toHaveLength(1);
    expect(recent.body.data.latestEventId).toBe(created.body.data.id);
  });

  /**
   * `source` is derived, never accepted: a request on the authenticated loopback
   * API is by definition the desk scanner, so a client cannot label its scans as
   * having come from a phone.
   */
  it('ignores a client-supplied source', async () => {
    const created = await post({ code: 'HC-000001', status: 'FOUND', source: 'PHONE_SCANNER' });
    expect(created.body.data.source).toBe('PC_SCANNER');
  });

  it('returns only events after the cursor', async () => {
    const first = await post({ code: 'HC-000001', status: 'FOUND' });
    await post({ code: 'HC-000002', status: 'NOT_FOUND' });
    const recent = await request(app)
      .get(`/api/v1/scanner/events/recent?since=${first.body.data.id}`)
      .set('Authorization', as(employee));
    expect(recent.body.data.events.map((event: { code: string }) => event.code)).toEqual(['HC-000002']);
  });

  it('rejects an unknown status', async () => {
    expect((await post({ code: 'HC-000001', status: 'MAYBE' })).status).toBe(400);
  });

  it('rejects a non-uuid product id', async () => {
    expect((await post({ code: 'HC-000001', status: 'FOUND', productId: 'not-a-uuid' })).status).toBe(400);
  });

  it('rejects a negative cursor', async () => {
    const response = await request(app).get('/api/v1/scanner/events/recent?since=-5').set('Authorization', as(employee));
    expect(response.status).toBe(400);
  });

  it('rate limits event recording', async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      expect((await post({ code: `HC-${attempt}`, status: 'FOUND' })).status).toBe(201);
    }
    expect((await post({ code: 'HC-overflow', status: 'FOUND' })).status).toBe(429);
  });

  it('does not touch the database to record a scan', async () => {
    prismaMock.$queryRaw.mockClear();
    await post({ code: 'HC-000001', status: 'FOUND' });
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });
});
