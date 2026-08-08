import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({ prismaMock: { $queryRaw: vi.fn() } }));
vi.mock('../../lib/prisma', () => ({ prisma: prismaMock, transactionModel: {}, activityLogModel: {} }));

import { app } from '../../app';

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);

const getStatus = (token?: string) => {
  const call = request(app).get('/api/v1/system/local-status');
  return token ? call.set('Authorization', `Bearer ${token}`) : call;
};

describe('local status route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([{ result: 1 }]);
  });

  it('reports the full status shape when the database answers', async () => {
    const response = await getStatus(employee);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      backend: 'UP',
      database: 'CONNECTED',
      lanScanner: { mode: 'DISABLED' },
    });
    expect(typeof response.body.data.appVersion).toBe('string');
    expect(Number.isNaN(Date.parse(response.body.data.serverTime))).toBe(false);
  });

  /**
   * The distinguishing behaviour of this endpoint: a dead database must still
   * produce a 200, or the client could not tell "backend down" from "database
   * down" — they would both look like a failed request.
   */
  it('still answers 200 with the database marked unavailable when the probe fails', async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error('ECONNREFUSED'));
    const response = await getStatus(employee);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ backend: 'UP', database: 'UNAVAILABLE' });
  });

  it('is open to any signed-in role, not just admins', async () => {
    for (const token of [employee, admin]) {
      expect((await getStatus(token)).status).toBe(200);
    }
  });

  it('rejects an unauthenticated caller', async () => {
    expect((await getStatus()).status).toBe(401);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('reports LAN scanner as disabled while no listener exists', async () => {
    expect((await getStatus(employee)).body.data.lanScanner).toEqual({ mode: 'DISABLED' });
  });
});
