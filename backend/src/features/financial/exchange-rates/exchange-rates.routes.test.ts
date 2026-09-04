import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { service } = vi.hoisted(() => ({
  service: { create: vi.fn(), list: vi.fn() },
}));

vi.mock('./exchange-rates.service', () => ({ ExchangeRatesService: service }));
vi.mock('../../../lib/prisma', () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) },
  transactionModel: {},
  activityLogModel: {},
}));

import { app } from '../../../app';

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('exchange-rate routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.list.mockResolvedValue([]);
    service.create.mockResolvedValue({ id: 'rate-1', rate: '90000.000000' });
  });

  it('is admin-only for both reading and append-only entry', async () => {
    expect((await request(app).get('/api/v1/admin/exchange-rates').set(auth(employee))).status).toBe(403);
    expect((await request(app).post('/api/v1/admin/exchange-rates').set(auth(employee)).send({
      rate: '90000', effectiveFrom: '2026-09-01T00:00:00.000Z',
    })).status).toBe(403);

    expect((await request(app).get('/api/v1/admin/exchange-rates').set(auth(admin))).status).toBe(200);
    const response = await request(app).post('/api/v1/admin/exchange-rates').set(auth(admin)).send({
      rate: '90000', effectiveFrom: '2026-09-01T00:00:00.000Z', note: 'Central rate',
    });
    expect(response.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ rate: '90000', note: 'Central rate' }),
      '11111111-1111-4111-8111-111111111111'
    );
  });

  it('exposes no update or delete operation', async () => {
    expect((await request(app).patch('/api/v1/admin/exchange-rates/rate-1').set(auth(admin)).send({ rate: '1' })).status).toBe(404);
    expect((await request(app).delete('/api/v1/admin/exchange-rates/rate-1').set(auth(admin))).status).toBe(404);
  });

  it('rejects zero, negative, and over-precision rates', async () => {
    for (const rate of ['0', '-1', '90000.0000001']) {
      expect((await request(app).post('/api/v1/admin/exchange-rates').set(auth(admin)).send({
        rate, effectiveFrom: '2026-09-01T00:00:00.000Z',
      })).status).toBe(400);
    }
  });
});
