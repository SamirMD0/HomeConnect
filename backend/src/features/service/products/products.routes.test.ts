import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { service } = vi.hoisted(() => ({ service: { create: vi.fn(), list: vi.fn(), get: vi.fn(), update: vi.fn(), archive: vi.fn(), restore: vi.fn(), label: vi.fn(), audit: vi.fn(), checkDuplicate: vi.fn(), serviceJobs: vi.fn() } }));
vi.mock('./products.service', () => ({ ProductsService: service }));
vi.mock('../../../lib/prisma', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) }, transactionModel: {}, activityLogModel: {} }));

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);
const productId = '33333333-3333-4333-8333-333333333333';
const product = { id: productId, name: 'Fan', model: 'F1', barcode: null, brand: null, price: null, discount: null, isActive: true };

describe('product routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.create.mockResolvedValue(product);
    service.list.mockResolvedValue({ items: [product], total: 1, page: 1, pageSize: 25 });
    service.get.mockResolvedValue(product);
    service.archive.mockResolvedValue({ ...product, isActive: false });
    service.checkDuplicate.mockResolvedValue({ matches: [] });
    service.serviceJobs.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
  });
  it('requires auth and lets employees create/list products', async () => {
    expect((await request(app).get('/api/v1/products')).status).toBe(401);
    const create = await request(app).post('/api/v1/products').set('Authorization', `Bearer ${employee}`).send({ name: 'Fan', model: 'F1' });
    expect(create.status).toBe(201); expect(service.create).toHaveBeenCalled();
    expect((await request(app).get('/api/v1/products').set('Authorization', `Bearer ${employee}`)).status).toBe(200);
  });
  it('protects archive and registers no delete route', async () => {
    expect((await request(app).post(`/api/v1/products/${productId}/archive`).set('Authorization', `Bearer ${employee}`).send({ reason: 'Archive duplicate', accountPassword: 'pass' })).status).toBe(403);
    expect((await request(app).post(`/api/v1/products/${productId}/archive`).set('Authorization', `Bearer ${admin}`).send({ reason: 'Archive duplicate', accountPassword: 'pass' })).status).toBe(200);
    expect((await request(app).delete(`/api/v1/products/${productId}`).set('Authorization', `Bearer ${admin}`)).status).toBe(404);
  });
  it('registers duplicate lookup before the product id route', async () => {
    const response = await request(app)
      .get('/api/v1/products/check-duplicate?name=Fan&model=F1')
      .set('Authorization', `Bearer ${employee}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ matches: [] });
    expect(service.checkDuplicate).toHaveBeenCalled();
    expect(service.get).not.toHaveBeenCalled();
  });
  it('returns related service-job pagination and validates sensitive updates', async () => {
    const jobs = await request(app)
      .get(`/api/v1/products/${productId}/service-jobs?page=1&pageSize=10`)
      .set('Authorization', `Bearer ${employee}`);
    expect(jobs.status).toBe(200);
    expect(jobs.body.meta.pagination.totalItems).toBe(0);

    const update = await request(app)
      .patch(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ price: '20.00' });
    expect(update.status).toBe(400);
  });
});
