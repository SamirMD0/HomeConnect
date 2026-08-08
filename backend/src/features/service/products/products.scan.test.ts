import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { repository } = vi.hoisted(() => ({ repository: { findByScanCode: vi.fn(), update: vi.fn(), create: vi.fn() } }));
vi.mock('./products.repository', () => ({ ProductsRepository: repository }));
vi.mock('../../../lib/prisma', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) }, transactionModel: {}, activityLogModel: {} }));

import { app } from '../../../app';
import { ProductsService } from './products.service';

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);

/**
 * A full row as Prisma returns it, sensitive fields included. The point of the
 * fixture is that the serializer has something to leak, so the exclusion test
 * below is meaningful.
 */
const row = (overrides: Record<string, unknown> = {}) => ({
  id: '33333333-3333-4333-8333-333333333333',
  sku: 'HC-000001',
  name: 'Ceiling Fan',
  model: 'CF-52',
  barcode: '0012345678905',
  brand: 'Toshiba',
  isActive: true,
  price: '250.00',
  discount: '10.00',
  costPrice: '180.00',
  pricingPresetId: null,
  useCustomPricing: false,
  installmentEnabled: false,
  trackStock: true,
  stockQuantity: 7,
  lowStockThreshold: 2,
  notes: 'Back shelf',
  specifications: [{ label: 'Blades', value: '5' }],
  specificationNotes: null,
  imageUrl: null,
  labelBarcodeSource: 'AUTO',
  createdById: '11111111-1111-4111-8111-111111111111',
  updatedById: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

describe('product scan lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findByScanCode.mockResolvedValue([]);
  });

  it('matches a manufacturer barcode', async () => {
    repository.findByScanCode.mockResolvedValue([row()]);
    const result = await ProductsService.scanLookup({ code: '0012345678905' });
    expect(result).toMatchObject({ status: 'FOUND', normalizedCode: '0012345678905', matchedBy: 'BARCODE' });
    expect(result.product?.sku).toBe('HC-000001');
  });

  it('matches a SKU when the label fell back to it', async () => {
    repository.findByScanCode.mockResolvedValue([row({ barcode: null })]);
    const result = await ProductsService.scanLookup({ code: 'HC-000001' });
    expect(result).toMatchObject({ status: 'FOUND', matchedBy: 'SKU' });
  });

  it('matches regardless of the case the code was scanned in', async () => {
    repository.findByScanCode.mockResolvedValue([row({ barcode: 'ab-12cd' })]);
    const result = await ProductsService.scanLookup({ code: 'AB-12CD' });
    expect(result).toMatchObject({ status: 'FOUND', matchedBy: 'BARCODE', normalizedCode: 'AB-12CD' });
    expect(repository.findByScanCode).toHaveBeenCalledWith('AB-12CD');
  });

  it('strips the scanner terminator before querying', async () => {
    repository.findByScanCode.mockResolvedValue([row()]);
    await ProductsService.scanLookup({ code: '0012345678905\r\n' });
    expect(repository.findByScanCode).toHaveBeenCalledWith('0012345678905');
  });

  it('prefers the barcode owner when a code is also another product SKU', async () => {
    const barcodeOwner = row({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sku: 'HC-000009', barcode: 'HC-000001' });
    const skuOwner = row({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', sku: 'HC-000001', barcode: null });
    repository.findByScanCode.mockResolvedValue([barcodeOwner, skuOwner]);
    const result = await ProductsService.scanLookup({ code: 'HC-000001' });
    expect(result).toMatchObject({ status: 'FOUND', matchedBy: 'BARCODE', alsoMatchedSku: true });
    expect(result.product?.id).toBe(barcodeOwner.id);
  });

  it('omits the cross-match flag when one product owns both codes', async () => {
    repository.findByScanCode.mockResolvedValue([row({ barcode: 'HC-000001' })]);
    const result = await ProductsService.scanLookup({ code: 'HC-000001' });
    expect(result.alsoMatchedSku).toBeUndefined();
  });

  it('returns an archived product flagged rather than hiding it', async () => {
    repository.findByScanCode.mockResolvedValue([row({ isActive: false })]);
    const result = await ProductsService.scanLookup({ code: '0012345678905' });
    expect(result.status).toBe('FOUND');
    expect(result.product?.isActive).toBe(false);
  });

  it('reports a code that matches nothing', async () => {
    const result = await ProductsService.scanLookup({ code: '9999999999999' });
    expect(result).toEqual({ status: 'NOT_FOUND', normalizedCode: '9999999999999', matchedBy: null, product: null });
  });

  it('rejects an unusable code without touching the database', async () => {
    for (const code of ['12', 'HC 000001', '<script>abcd</script>']) {
      expect(await ProductsService.scanLookup({ code })).toEqual({
        status: 'INVALID_CODE', normalizedCode: null, matchedBy: null, product: null,
      });
    }
    expect(repository.findByScanCode).not.toHaveBeenCalled();
  });

  it('never returns pricing, cost, stock, or any other sensitive product field', async () => {
    repository.findByScanCode.mockResolvedValue([row()]);
    const result = await ProductsService.scanLookup({ code: '0012345678905' });
    expect(Object.keys(result.product ?? {}).sort()).toEqual(
      ['barcode', 'brand', 'id', 'isActive', 'model', 'name', 'sku']
    );
    for (const forbidden of [
      'price', 'discount', 'netPrice', 'pricing', 'costPrice', 'internalPriceCode', 'configuration',
      'trackStock', 'stockQuantity', 'lowStockThreshold', 'stockStatus',
      'notes', 'specifications', 'specificationNotes', 'imageUrl', 'image',
      'createdById', 'updatedById', 'createdBy', 'updatedBy', 'labelBarcodeSource',
    ]) {
      expect(Object.keys(result.product ?? {})).not.toContain(forbidden);
    }
  });

  it('performs no write while resolving a scan', async () => {
    repository.findByScanCode.mockResolvedValue([row()]);
    await ProductsService.scanLookup({ code: '0012345678905' });
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });
});

describe('product scan route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findByScanCode.mockResolvedValue([row()]);
  });

  it('resolves /scan to the scan handler instead of the product id route', async () => {
    const response = await request(app).get('/api/v1/products/scan?code=0012345678905').set('Authorization', `Bearer ${employee}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'FOUND', matchedBy: 'BARCODE' });
  });

  it('is available to employees as well as admins', async () => {
    for (const token of [employee, admin]) {
      expect((await request(app).get('/api/v1/products/scan?code=HC-000001').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    }
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/products/scan?code=HC-000001')).status).toBe(401);
  });

  it('rejects a request with no code at all', async () => {
    const response = await request(app).get('/api/v1/products/scan').set('Authorization', `Bearer ${employee}`);
    expect(response.status).toBe(400);
    expect(repository.findByScanCode).not.toHaveBeenCalled();
  });

  it('answers an unusable code with a scannable state, not an error', async () => {
    const response = await request(app).get('/api/v1/products/scan?code=ab').set('Authorization', `Bearer ${employee}`);
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('INVALID_CODE');
  });
});
