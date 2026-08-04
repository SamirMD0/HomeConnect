import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { service } = vi.hoisted(() => ({ service: { create: vi.fn(), list: vi.fn(), get: vi.fn(), update: vi.fn(), archive: vi.fn(), restore: vi.fn(), label: vi.fn(), labels: vi.fn(), audit: vi.fn(), checkDuplicate: vi.fn(), serviceJobs: vi.fn(), updateSku: vi.fn(), regenerateSku: vi.fn(), updateStock: vi.fn() } }));
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
    service.label.mockResolvedValue({ id: productId, sku: 'HC-000001', barcodeValue: 'HC-000001', barcodeSource: 'SKU', internalPriceCode: null });
    service.labels.mockResolvedValue({ labels: [], warnings: [] });
    service.updateSku.mockResolvedValue(product);
    service.regenerateSku.mockResolvedValue(product);
    service.updateStock.mockResolvedValue(product);
  });
  it('keeps protected SKU and stock routes above the bare product route', async () => {
    const credentials = { reason: 'Correct product identity', accountPassword: 'pass' };
    expect((await request(app).patch(`/api/v1/products/${productId}/sku`).set('Authorization', `Bearer ${admin}`).send({ ...credentials, sku: 'HC-009999' })).status).toBe(200);
    expect((await request(app).post(`/api/v1/products/${productId}/regenerate-sku`).set('Authorization', `Bearer ${admin}`).send(credentials)).status).toBe(200);
    expect((await request(app).patch(`/api/v1/products/${productId}/stock`).set('Authorization', `Bearer ${admin}`).send({ ...credentials, trackStock: true, stockQuantity: 2, lowStockThreshold: 1 })).status).toBe(200);
    expect(service.update).not.toHaveBeenCalled();
  });
  it('serves a narrow label payload without any price field', async () => {
    const response = await request(app).get(`/api/v1/products/${productId}/label?includePriceCode=true`).set('Authorization', `Bearer ${employee}`);
    expect(response.status).toBe(200);
    for (const forbidden of ['price', 'costPrice', 'cashPrice', 'installmentPrice', 'discount']) {
      expect(Object.keys(response.body.data)).not.toContain(forbidden);
    }
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
  it('registers the bulk label sheet before the product id route', async () => {
    const response = await request(app)
      .get(`/api/v1/products/labels?ids=${productId}`)
      .set('Authorization', `Bearer ${employee}`);
    expect(response.status).toBe(200);
    expect(service.labels).toHaveBeenCalled();
    // "labels" must not be swallowed as a product id by GET /:productId.
    expect(service.get).not.toHaveBeenCalled();
  });
  it('rejects an empty or oversized label selection', async () => {
    const empty = await request(app).get('/api/v1/products/labels?ids=').set('Authorization', `Bearer ${employee}`);
    expect(empty.status).toBe(400);

    const tooMany = Array.from({ length: 101 }, (_, index) => `${index.toString().padStart(8, '0')}-3333-4333-8333-333333333333`);
    const oversized = await request(app).get(`/api/v1/products/labels?ids=${tooMany.join(',')}`).set('Authorization', `Bearer ${employee}`);
    expect(oversized.status).toBe(400);
    expect(service.labels).not.toHaveBeenCalled();
  });
  it('rejects a label selection containing a non-uuid id', async () => {
    const response = await request(app).get('/api/v1/products/labels?ids=not-a-uuid').set('Authorization', `Bearer ${employee}`);
    expect(response.status).toBe(400);
    expect(service.labels).not.toHaveBeenCalled();
  });
  it('dedupes repeated ids before reaching the service', async () => {
    await request(app)
      .get(`/api/v1/products/labels?ids=${productId},${productId}`)
      .set('Authorization', `Bearer ${employee}`);
    expect(service.labels).toHaveBeenCalledWith(expect.objectContaining({ ids: [productId] }));
  });
});
