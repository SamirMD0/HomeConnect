import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { service } = vi.hoisted(() => ({
  service: { get: vi.fn(), update: vi.fn() },
}));

vi.mock('./business-settings.service', () => ({ BusinessSettingsService: service }));
vi.mock('../../lib/prisma', () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) },
  transactionModel: {},
  activityLogModel: {},
}));

import { app } from '../../app';

const secret = process.env.JWT_SECRET!;
const adminId = '11111111-1111-4111-8111-111111111111';
const admin = jwt.sign({ userId: adminId, role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const settings = {
  id: 'primary', shopName: 'Home Connect', address: 'Beirut', phone: '01 234 567',
  taxNumber: 'VAT-123', logoUrl: null, email: 'shop@example.com', updatedAt: '2026-09-09T00:00:00.000Z',
};

describe('business-settings routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.get.mockResolvedValue(settings);
    service.update.mockResolvedValue(settings);
  });

  it('allows every authenticated employee to read invoice identity settings', async () => {
    const response = await request(app).get('/api/v1/business-settings').set(auth(employee));
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(settings);
  });

  it('allows only admins to update settings and passes the actor id', async () => {
    const input = {
      shopName: 'Home Connect', address: 'Beirut', phone: '01 234 567', taxNumber: 'VAT-123',
      logoUrl: null, email: 'shop@example.com',
    };
    expect((await request(app).put('/api/v1/business-settings').set(auth(employee)).send(input)).status).toBe(403);

    const response = await request(app).put('/api/v1/business-settings').set(auth(admin)).send(input);
    expect(response.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith(input, adminId);
  });

  it('rejects markup and unsafe logo schemes', async () => {
    const base = { shopName: null, address: null, phone: null, taxNumber: null, logoUrl: null, email: null };
    expect((await request(app).put('/api/v1/business-settings').set(auth(admin)).send({ ...base, shopName: '<b>Shop</b>' })).status).toBe(400);
    expect((await request(app).put('/api/v1/business-settings').set(auth(admin)).send({ ...base, logoUrl: 'javascript:alert(1)' })).status).toBe(400);
  });
});
