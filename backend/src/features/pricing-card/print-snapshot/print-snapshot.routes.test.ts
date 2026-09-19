import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { service } = vi.hoisted(() => ({ service: { recordPrint: vi.fn(), listPrintsForProduct: vi.fn() } }));
vi.mock('./print-snapshot.service', () => ({ PrintSnapshotService: service }));
vi.mock('../../../lib/prisma', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) }, transactionModel: {}, activityLogModel: {} }));

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);
const productId = '33333333-3333-4333-8333-333333333333';
const templateId = '20000000-0000-4000-8000-000000000001';
const input = {
  productId, templateId, snapshot: { name: 'Washer', price: '499.00', features: [] },
  validUntil: '2026-10-31', currencyCode: 'USD', publicPrice: '499.00',
  staffLabelCode: 'HC-000001-K380Z', barcodeValue: '2000000000015', copiesPrinted: 2,
  accountPassword: 'secret',
};

describe('pricing-card print snapshot routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.recordPrint.mockResolvedValue({ recorded: true, print: { id: '44444444-4444-4444-8444-444444444444' } });
    service.listPrintsForProduct.mockResolvedValue([]);
  });

  it('requires authentication, admin role, and an account password to record', async () => {
    expect((await request(app).post('/api/v1/pricing-card-prints').send(input)).status).toBe(401);
    expect((await request(app).post('/api/v1/pricing-card-prints').set('Authorization', `Bearer ${employee}`).send(input)).status).toBe(403);
    expect((await request(app).post('/api/v1/pricing-card-prints').set('Authorization', `Bearer ${admin}`).send({ ...input, accountPassword: undefined })).status).toBe(401);
    expect((await request(app).post('/api/v1/pricing-card-prints').set('Authorization', `Bearer ${admin}`).send(input)).status).toBe(201);
    expect(service.recordPrint).toHaveBeenCalledWith(expect.objectContaining({ productId, templateId }), expect.objectContaining({ role: 'ADMIN' }), expect.anything());
  });

  it('rejects a snapshot larger than 8 KB', async () => {
    const response = await request(app).post('/api/v1/pricing-card-prints').set('Authorization', `Bearer ${admin}`)
      .send({ ...input, snapshot: { notes: 'x'.repeat(8192) } });
    expect(response.status).toBe(400);
    expect(service.recordPrint).not.toHaveBeenCalled();
  });

  it('lists a bounded product print history for authenticated staff', async () => {
    expect((await request(app).get(`/api/v1/pricing-card-prints/product/${productId}?limit=25`).set('Authorization', `Bearer ${employee}`)).status).toBe(200);
    expect(service.listPrintsForProduct).toHaveBeenCalledWith(productId, 25);
  });
});
