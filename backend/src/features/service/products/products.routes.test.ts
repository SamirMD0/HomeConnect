import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { service } = vi.hoisted(() => ({ service: { create: vi.fn(), list: vi.fn(), brands: vi.fn(), normalizeBrands: vi.fn(), get: vi.fn(), update: vi.fn(), updateFeatures: vi.fn(), archive: vi.fn(), restore: vi.fn(), label: vi.fn(), labels: vi.fn(), labelSecretPreview: vi.fn(), pricingCardSecretPreview: vi.fn(), labelsSecretPreview: vi.fn(), audit: vi.fn(), checkDuplicate: vi.fn(), serviceJobs: vi.fn(), updateSku: vi.fn(), regenerateSku: vi.fn(), updateStock: vi.fn() } }));
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
    service.brands.mockResolvedValue({ brands: [{ canonical: 'Kozano', productCount: 20, spellings: ['Kozano', 'KOZANO', 'kozano'], spellingCounts: [{ spelling: 'Kozano', productCount: 12 }, { spelling: 'KOZANO', productCount: 5 }, { spelling: 'kozano', productCount: 3 }] }] });
    service.normalizeBrands.mockResolvedValue({ targetBrand: 'General', affectedCount: 1, products: [{ id: productId, sku: 'HC-000001', name: 'Fan', brand: 'GENERAL' }], warnings: [] });
    service.get.mockResolvedValue(product);
    service.archive.mockResolvedValue({ ...product, isActive: false });
    service.checkDuplicate.mockResolvedValue({ matches: [] });
    service.serviceJobs.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    service.label.mockResolvedValue({ payload: { id: productId, sku: 'HC-000001', barcodeValue: 'HC-000001', barcodeSource: 'SKU', internalPriceCode: null }, warnings: [] });
    service.labels.mockResolvedValue({ labels: [], warnings: [] });
    service.labelSecretPreview.mockResolvedValue({ payload: { id: productId, sku: 'HC-000001', barcodeValue: 'HC-000001', staffLabelCode: 'HC-000001-K380Z', secretPrice: '380.00' }, warnings: [] });
    service.pricingCardSecretPreview.mockResolvedValue({ payload: { id: productId, templateId: '44444444-4444-4444-8444-444444444444', sku: 'HC-000001', barcodeValue: 'HC-000001', staffLabelCode: 'HC-000001-K380Z', secretPrice: '380.00' }, warnings: [] });
    service.labelsSecretPreview.mockResolvedValue({ labels: [], warnings: [] });
    service.updateSku.mockResolvedValue(product);
    service.regenerateSku.mockResolvedValue(product);
    service.updateStock.mockResolvedValue(product);
    service.updateFeatures.mockResolvedValue({ ...product, featureHighlights: [] });
  });
  it('keeps protected SKU and stock routes above the bare product route', async () => {
    expect((await request(app).patch(`/api/v1/products/${productId}/sku`).set('Authorization', `Bearer ${admin}`).send({ sku: 'HC-009999' })).status).toBe(200);
    expect((await request(app).post(`/api/v1/products/${productId}/regenerate-sku`).set('Authorization', `Bearer ${admin}`).send({})).status).toBe(200);
    expect((await request(app).patch(`/api/v1/products/${productId}/stock`).set('Authorization', `Bearer ${admin}`).send({ trackStock: true, lowStockThreshold: 1 })).status).toBe(200);
    expect(service.update).not.toHaveBeenCalled();
  });

  it('takes SKU and stock-settings changes without an account password', async () => {
    expect((await request(app).patch(`/api/v1/products/${productId}/sku`).set('Authorization', `Bearer ${admin}`).send({ sku: 'HC-009999', accountPassword: 'pass' })).status).toBe(400);
    expect((await request(app).patch(`/api/v1/products/${productId}/stock`).set('Authorization', `Bearer ${admin}`).send({ trackStock: true, lowStockThreshold: 1, reason: 'Because' })).status).toBe(400);
  });

  it('keeps SKU and stock settings admin-only', async () => {
    expect((await request(app).patch(`/api/v1/products/${productId}/sku`).set('Authorization', `Bearer ${employee}`).send({ sku: 'HC-009999' })).status).toBe(403);
    expect((await request(app).post(`/api/v1/products/${productId}/regenerate-sku`).set('Authorization', `Bearer ${employee}`).send({})).status).toBe(403);
    expect((await request(app).patch(`/api/v1/products/${productId}/stock`).set('Authorization', `Bearer ${employee}`).send({ trackStock: true, lowStockThreshold: 1 })).status).toBe(403);
  });

  it('rejects pricing fields posted to the relaxed product update route', async () => {
    for (const body of [{ costPrice: '10.00' }, { customProfitPercent: '20' }, { pricingPresetId: productId }, { useCustomPricing: true }]) {
      const response = await request(app).patch(`/api/v1/products/${productId}`).set('Authorization', `Bearer ${admin}`).send(body);
      expect(response.status).toBe(400);
    }
    expect(service.update).not.toHaveBeenCalled();
  });

  it('no longer accepts a typed reason or password on the product update route', async () => {
    const response = await request(app).patch(`/api/v1/products/${productId}`).set('Authorization', `Bearer ${admin}`)
      .send({ name: 'Fan', reason: 'Correct product identity', accountPassword: 'pass' });
    expect(response.status).toBe(400);
    expect(service.update).not.toHaveBeenCalled();
  });
  it('serves a narrow label payload without any price field', async () => {
    const response = await request(app).get(`/api/v1/products/${productId}/label?includePriceCode=true`).set('Authorization', `Bearer ${employee}`);
    expect(response.status).toBe(200);
    for (const forbidden of ['price', 'costPrice', 'cashPrice', 'installmentPrice', 'discount']) {
      expect(Object.keys(response.body.data.payload)).not.toContain(forbidden);
    }
  });
  it('carries automatic barcode fallback warnings on the single-label endpoint', async () => {
    service.label.mockResolvedValueOnce({
      payload: { id: productId, sku: 'HC-000001', barcodeValue: 'HC-000001', barcodeSource: 'SKU' },
      warnings: [{ productId, code: 'FALLBACK_TO_SKU', name: 'Fan' }],
    });
    const response = await request(app).get(`/api/v1/products/${productId}/label`).set('Authorization', `Bearer ${employee}`);
    expect(response.status).toBe(200);
    expect(response.body.data.warnings).toContainEqual({ productId, code: 'FALLBACK_TO_SKU', name: 'Fan' });
  });
  it('threads template options and exposes single and bulk pricing-card reads', async () => {
    const templateId = '44444444-4444-4444-8444-444444444444';
    const options = `templateId=${templateId}&validUntil=2026-10-31&featureCodes=wifi,qled`;
    expect((await request(app).get(`/api/v1/products/${productId}/label?${options}`).set('Authorization', `Bearer ${employee}`)).status).toBe(200);
    expect(service.label).toHaveBeenLastCalledWith(productId, expect.objectContaining({
      templateId, validUntil: '2026-10-31', featureCodes: ['wifi', 'qled'],
    }));

    expect((await request(app).get(`/api/v1/products/${productId}/pricing-card?${options}`).set('Authorization', `Bearer ${employee}`)).status).toBe(200);
    expect(service.label).toHaveBeenLastCalledWith(productId, expect.objectContaining({ templateId, includePrice: true }));

    expect((await request(app).get(`/api/v1/products/pricing-cards?ids=${productId}&${options}`).set('Authorization', `Bearer ${employee}`)).status).toBe(200);
    expect(service.labels).toHaveBeenLastCalledWith(expect.objectContaining({ ids: [productId], templateId, includePrice: true }));
  });

  it('requires a valid template and date on pricing-card reads', async () => {
    expect((await request(app).get(`/api/v1/products/${productId}/pricing-card`).set('Authorization', `Bearer ${employee}`)).status).toBe(400);
    expect((await request(app).get(`/api/v1/products/${productId}/pricing-card?templateId=bad&validUntil=31-10-2026`).set('Authorization', `Bearer ${employee}`)).status).toBe(400);
  });

  it('keeps pricing-card feature replacement admin-only and password-protected', async () => {
    const featureHighlights = [
      { iconCode: 'capacity', label: 'Capacity', value: '9 kg', position: 2 },
      { iconCode: 'spin-speed', label: null, value: '1200 rpm', position: 1 },
    ];
    const path = `/api/v1/products/${productId}/features`;
    expect((await request(app).patch(path).send({ featureHighlights, accountPassword: 'secret' })).status).toBe(401);
    expect((await request(app).patch(path).set('Authorization', `Bearer ${employee}`).send({ featureHighlights, accountPassword: 'secret' })).status).toBe(403);
    expect((await request(app).patch(path).set('Authorization', `Bearer ${admin}`).send({ featureHighlights })).status).toBe(401);
    expect((await request(app).patch(path).set('Authorization', `Bearer ${admin}`).send({ featureHighlights, accountPassword: 'secret' })).status).toBe(200);
    expect(service.updateFeatures).toHaveBeenCalledWith(productId, expect.objectContaining({
      accountPassword: 'secret',
      featureHighlights: [featureHighlights[1], featureHighlights[0]],
    }), expect.objectContaining({ role: 'ADMIN' }), expect.anything());
  });

  it('supports delete-all highlights and rejects more than eight', async () => {
    const path = `/api/v1/products/${productId}/features`;
    expect((await request(app).patch(path).set('Authorization', `Bearer ${admin}`).send({ featureHighlights: [], accountPassword: 'secret' })).status).toBe(200);
    const tooMany = Array.from({ length: 9 }, (_, index) => ({ iconCode: `feature-${index}`, position: index + 1 }));
    expect((await request(app).patch(path).set('Authorization', `Bearer ${admin}`).send({ featureHighlights: tooMany, accountPassword: 'secret' })).status).toBe(400);
  });
  it('keeps per-print hidden-preset selection admin-only and password-protected', async () => {
    const input = { includePriceCode: true, includePrice: true, hiddenPricingPresetId: productId, encodingPresetId: '44444444-4444-4444-8444-444444444444', manualDiscountStages: [7, 2, 1], accountPassword: 'secret' };
    expect((await request(app).post(`/api/v1/products/${productId}/label/secret-preview`).set('Authorization', `Bearer ${employee}`).send(input)).status).toBe(403);
    expect((await request(app).post(`/api/v1/products/${productId}/label/secret-preview`).set('Authorization', `Bearer ${admin}`).send({ ...input, accountPassword: '' })).status).toBe(400);
    expect((await request(app).post(`/api/v1/products/${productId}/label/secret-preview`).set('Authorization', `Bearer ${admin}`).send(input)).status).toBe(200);
    expect(service.labelSecretPreview).toHaveBeenCalledWith(productId, input, expect.objectContaining({ role: 'ADMIN' }), expect.anything());
    expect((await request(app).post(`/api/v1/products/${productId}/label/secret-preview`).set('Authorization', `Bearer ${admin}`).send({ ...input, manualDiscountStages: [0, 5] })).status).toBe(400);
  });
  it('previews secret pricing through the selected pricing-card template', async () => {
    const input = {
      includePriceCode: true, includePrice: true,
      hiddenPricingPresetId: productId,
      encodingPresetId: '44444444-4444-4444-8444-444444444444',
      templateId: '55555555-5555-4555-8555-555555555555',
      validUntil: '2026-10-31', featureCodes: ['wifi', 'qled'], accountPassword: 'secret',
    };
    const path = `/api/v1/products/${productId}/pricing-card/secret-preview`;
    expect((await request(app).post(path).set('Authorization', `Bearer ${employee}`).send(input)).status).toBe(403);
    expect((await request(app).post(path).set('Authorization', `Bearer ${admin}`).send({ ...input, accountPassword: '' })).status).toBe(400);
    expect((await request(app).post(path).set('Authorization', `Bearer ${admin}`).send(input)).status).toBe(200);
    expect(service.pricingCardSecretPreview).toHaveBeenCalledWith(productId, input, expect.objectContaining({ role: 'ADMIN' }), expect.anything());
  });
  it('requires auth and lets employees create/list products', async () => {
    expect((await request(app).get('/api/v1/products')).status).toBe(401);
    const create = await request(app).post('/api/v1/products').set('Authorization', `Bearer ${employee}`).send({ name: 'Fan', model: 'F1' });
    expect(create.status).toBe(201); expect(service.create).toHaveBeenCalled();
    expect((await request(app).get('/api/v1/products').set('Authorization', `Bearer ${employee}`)).status).toBe(200);
  });
  it('passes valid stock-status filters to the service and rejects unknown values', async () => {
    const valid = await request(app).get('/api/v1/products?stockStatus=LOW_STOCK').set('Authorization', `Bearer ${employee}`);
    expect(valid.status).toBe(200);
    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ stockStatus: 'LOW_STOCK' }), expect.objectContaining({ role: 'EMPLOYEE' }));

    service.list.mockClear();
    const invalid = await request(app).get('/api/v1/products?stockStatus=NONSENSE').set('Authorization', `Bearer ${employee}`);
    expect(invalid.status).toBe(400);
    expect(service.list).not.toHaveBeenCalled();
  });
  it('creates a product with both pricing booleans off and no cost price', async () => {
    const response = await request(app).post('/api/v1/products').set('Authorization', `Bearer ${admin}`).send({
      name: 'Fan', model: 'F1', useCustomPricing: false, installmentEnabled: false,
    });
    expect(response.status).toBe(201);
    expect(service.create).toHaveBeenCalled();
  });
  it('creates cash-only custom pricing without installment fields', async () => {
    const response = await request(app).post('/api/v1/products').set('Authorization', `Bearer ${admin}`).send({
      name: 'Accessory', model: 'A1', costPrice: '10.00', useCustomPricing: true, installmentEnabled: false,
      customExpensePercent: '5', customProfitPercent: '20', customDiscountBufferPercent: '5', customCalculationMode: 'COMPOUND',
    });
    expect(response.status).toBe(201);
  });
  it('accepts a manual-price-only product', async () => {
    service.create.mockResolvedValueOnce({ ...product, price: '125.00', pricing: { pricingAvailable: false, mode: 'MANUAL' } });
    const response = await request(app).post('/api/v1/products').set('Authorization', `Bearer ${admin}`).send({ name: 'Manual Fan', model: 'M1', price: '125.00' });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ price: '125.00', pricing: { mode: 'MANUAL' } });
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
  it('registers brands before the product id route and exposes only names and counts', async () => {
    const response = await request(app).get('/api/v1/products/brands').set('Authorization', `Bearer ${employee}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ brands: [{ canonical: 'Kozano', productCount: 20, spellings: ['Kozano', 'KOZANO', 'kozano'], spellingCounts: [{ spelling: 'Kozano', productCount: 12 }, { spelling: 'KOZANO', productCount: 5 }, { spelling: 'kozano', productCount: 3 }] }] });
    expect(service.brands).toHaveBeenCalled();
    expect(service.get).not.toHaveBeenCalled();
    for (const forbidden of ['price', 'costPrice', 'cashPrice', 'stock', 'stockQuantity']) {
      expect(JSON.stringify(response.body.data)).not.toContain(forbidden);
    }
  });
  it('registers brand normalization before the product id route and enforces admin authentication', async () => {
    const body = { sourceBrands: ['General', 'GENERAL'], targetBrand: 'General', reason: 'Normalize duplicate spelling', dryRun: true };
    expect((await request(app).post('/api/v1/products/brands/normalize').send(body)).status).toBe(401);
    expect((await request(app).post('/api/v1/products/brands/normalize').set('Authorization', `Bearer ${employee}`).send(body)).status).toBe(403);
    const response = await request(app).post('/api/v1/products/brands/normalize').set('Authorization', `Bearer ${admin}`).set('x-request-id', 'brand-route-request').send(body);
    expect(response.status).toBe(200);
    expect(service.normalizeBrands).toHaveBeenCalledWith(expect.objectContaining(body), expect.objectContaining({ role: 'ADMIN' }), expect.objectContaining({ requestId: 'brand-route-request' }));
    expect(service.get).not.toHaveBeenCalled();
    for (const forbidden of ['price', 'costPrice', 'discount', 'stockQuantity']) expect(JSON.stringify(response.body.data)).not.toContain(forbidden);
  });
  it('rejects an empty duplicate lookup while keeping barcode lookup available to employees', async () => {
    const empty = await request(app).get('/api/v1/products/check-duplicate').set('Authorization', `Bearer ${employee}`);
    const barcode = await request(app).get('/api/v1/products/check-duplicate?barcode=AbC-1234').set('Authorization', `Bearer ${employee}`);
    expect(empty.status).toBe(400);
    expect(barcode.status).toBe(200);
    expect(service.checkDuplicate).toHaveBeenCalledWith(expect.objectContaining({ barcode: 'AbC-1234' }));
  });
  it('returns related service-job pagination and takes a sensitive update without credentials', async () => {
    const jobs = await request(app)
      .get(`/api/v1/products/${productId}/service-jobs?page=1&pageSize=10`)
      .set('Authorization', `Bearer ${employee}`);
    expect(jobs.status).toBe(200);
    expect(jobs.body.meta.pagination.totalItems).toBe(0);

    const update = await request(app)
      .patch(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ price: '20.00' });
    expect(update.status).toBe(200);
    expect(service.update).toHaveBeenCalled();
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
