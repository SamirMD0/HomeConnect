import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StockMovementType } from '@prisma/client';

const { service } = vi.hoisted(() => ({
  service: {
    getInventorySummary: vi.fn(),
    getLowStockProducts: vi.fn(),
    getProductMovements: vi.fn(),
    getProductInventory: vi.fn(),
    verifyOpeningCount: vi.fn(),
    addStock: vi.fn(),
    removeStock: vi.fn(),
    correctStockCount: vi.fn(),
    markDamagedLost: vi.fn(),
    returnToStock: vi.fn(),
    getMaintenanceStockIntegrity: vi.fn(),
  },
}));

vi.mock('./inventory.service', () => ({ InventoryService: service }));
vi.mock('../../lib/prisma', () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) },
  transactionModel: {},
  activityLogModel: {},
}));

import { app } from '../../app';

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const productId = '11111111-1111-4111-8111-111111111111';
const admin = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '33333333-3333-4333-8333-333333333333', role: 'EMPLOYEE' }, secret);
const as = (token: string) => `Bearer ${token}`;
const result = { changed: true, product: { id: productId, stockQuantity: 3 }, movement: { id: 'movement' } };

describe('inventory routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.getInventorySummary.mockResolvedValue({ trackedProducts: 2, lowStockProducts: 1, outOfStockProducts: 1, recentMovements: [] });
    service.getLowStockProducts.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });
    service.getProductMovements.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });
    service.getProductInventory.mockResolvedValue({ product: { id: productId }, onboardingStatus: 'ONBOARDED', recentMovements: [] });
    service.verifyOpeningCount.mockResolvedValue(result);
    for (const name of ['addStock', 'removeStock', 'correctStockCount', 'markDamagedLost', 'returnToStock'] as const) {
      service[name].mockResolvedValue(result);
    }
  });

  it('exposes opening-count verification to admins only and accepts zero', async () => {
    const url = `/api/v1/products/${productId}/opening-count`;
    const input = { verifiedCount: 0, reason: 'Verified empty shelf', accountPassword: 'secret' };
    expect((await request(app).post(url).set('Authorization', as(employee)).send(input)).status).toBe(403);
    expect((await request(app).post(url).set('Authorization', as(admin)).send(input)).status).toBe(201);
    expect(service.verifyOpeningCount).toHaveBeenCalledWith(productId, input, expect.objectContaining({ role: 'ADMIN' }), expect.any(Object));
  });

  it('rejects negative opening counts and missing passwords before the service', async () => {
    const url = `/api/v1/products/${productId}/opening-count`;
    expect((await request(app).post(url).set('Authorization', as(admin)).send({
      verifiedCount: -1, reason: 'Invalid count', accountPassword: 'secret',
    })).status).toBe(400);
    expect((await request(app).post(url).set('Authorization', as(admin)).send({
      verifiedCount: 1, reason: 'Counted shelf',
    })).status).toBe(400);
    expect(service.verifyOpeningCount).not.toHaveBeenCalled();
  });

  it('requires authentication on every inventory surface', async () => {
    for (const [method, path] of [
      ['get', '/api/v1/inventory/summary'],
      ['get', `/api/v1/products/${productId}/inventory`],
      ['post', `/api/v1/products/${productId}/stock-movements`],
    ] as const) expect((await request(app)[method](path)).status).toBe(401);
  });

  it('exposes summary, low stock, history, and product inventory to employees', async () => {
    expect((await request(app).get('/api/v1/inventory/summary').set('Authorization', as(employee))).status).toBe(200);
    expect((await request(app).get('/api/v1/inventory/low-stock?search=HC&page=1').set('Authorization', as(employee))).status).toBe(200);
    expect((await request(app).get('/api/v1/inventory/movements?page=1').set('Authorization', as(employee))).status).toBe(200);
    expect((await request(app).get(`/api/v1/products/${productId}/inventory`).set('Authorization', as(employee))).status).toBe(200);
  });

  it.each([
    [StockMovementType.MANUAL_ADD, 'addStock', employee, {}],
    [StockMovementType.RETURN_TO_STOCK, 'returnToStock', employee, {}],
    [StockMovementType.MANUAL_REMOVE, 'removeStock', admin, { accountPassword: 'secret' }],
    [StockMovementType.STOCK_COUNT, 'correctStockCount', admin, { accountPassword: 'secret' }],
    [StockMovementType.DAMAGE_LOSS, 'markDamagedLost', admin, { accountPassword: 'secret' }],
  ])('dispatches %s through the sole quantity-write endpoint', async (movementType, method, token, extra) => {
    const response = await request(app)
      .post(`/api/v1/products/${productId}/stock-movements`)
      .set('Authorization', as(token as string))
      .send({ movementType, quantity: movementType === StockMovementType.STOCK_COUNT ? 0 : 2, expectedBefore: 1, reason: 'Verified stock action', ...extra });
    expect(response.status).toBe(201);
    expect(service[method as keyof typeof service]).toHaveBeenCalledTimes(1);
  });

  it('rejects guarded actions without a password and rejects reserved or zero-change types', async () => {
    const url = `/api/v1/products/${productId}/stock-movements`;
    expect((await request(app).post(url).set('Authorization', as(admin)).send({
      movementType: StockMovementType.MANUAL_REMOVE, quantity: 1, reason: 'Correction',
    })).status).toBe(400);
    expect((await request(app).post(url).set('Authorization', as(admin)).send({
      movementType: StockMovementType.PURCHASE_RECEIPT, quantity: 1, reason: 'Not wired',
    })).status).toBe(400);
    expect((await request(app).post(url).set('Authorization', as(employee)).send({
      movementType: StockMovementType.MANUAL_ADD, quantity: 0, reason: 'No change',
    })).status).toBe(400);
  });
});
