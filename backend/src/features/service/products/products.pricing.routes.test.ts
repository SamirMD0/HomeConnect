import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { service } = vi.hoisted(() => ({ service: {
  create: vi.fn(), list: vi.fn(), get: vi.fn(), update: vi.fn(), archive: vi.fn(), restore: vi.fn(), label: vi.fn(), audit: vi.fn(), checkDuplicate: vi.fn(), serviceJobs: vi.fn(),
  getPricingPreview: vi.fn(), updatePricing: vi.fn(),
} }));
vi.mock('./products.service', () => ({ ProductsService: service }));
vi.mock('../../../lib/prisma', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) }, transactionModel: {}, activityLogModel: {} }));
const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);
const id = '33333333-3333-4333-8333-333333333333';

describe('product pricing routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.getPricingPreview.mockResolvedValue({ pricingAvailable: false, reason: 'MISSING_COST_PRICE' });
    service.updatePricing.mockResolvedValue({ id });
  });

  it('allows staff previews and protects pricing writes', async () => {
    expect((await request(app).get(`/api/v1/products/${id}/pricing-preview`).set('Authorization', `Bearer ${employee}`)).status).toBe(200);
    const payload = { costPrice: '300.00', reason: 'Set supplier cost', accountPassword: 'secret' };
    expect((await request(app).patch(`/api/v1/products/${id}/pricing`).set('Authorization', `Bearer ${employee}`).send(payload)).status).toBe(403);
    expect((await request(app).patch(`/api/v1/products/${id}/pricing`).set('Authorization', `Bearer ${admin}`).send(payload)).status).toBe(200);
    expect(service.get).not.toHaveBeenCalled();
  });
});
