import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { service, inventoryService } = vi.hoisted(() => ({
  service: {
    create: vi.fn(), list: vi.fn(), get: vi.fn(), summary: vi.fn(), update: vi.fn(),
    addItem: vi.fn(), updateItem: vi.fn(), removeItem: vi.fn(), changeStatus: vi.fn(),
    changePayment: vi.fn(), cancel: vi.fn(), restore: vi.fn(), returnOrder: vi.fn(),
    createDebt: vi.fn(), createInstallmentPlan: vi.fn(), unlinkFinancial: vi.fn(), audit: vi.fn(),
  },
  inventoryService: { deductStock: vi.fn(), restoreStock: vi.fn() },
}));
vi.mock('./sales-orders.service', () => ({ SalesOrdersService: service }));
vi.mock('./sales-order-inventory.service', () => ({ SalesOrderInventoryService: inventoryService }));
vi.mock('../../../lib/prisma', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) }, transactionModel: {}, activityLogModel: {} }));

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);
const unknownRole = jwt.sign({ userId: '77777777-7777-4777-8777-777777777777', role: 'VIEWER' }, secret);
const orderId = '33333333-3333-4333-8333-333333333333';
const itemId = '55555555-5555-4555-8555-555555555555';
const fulfillmentId = '66666666-6666-4666-8666-666666666666';
const order = { id: orderId, orderNumber: 'SO-2026-0001', totalAmount: '10.00', paymentStatus: 'PAID' };
const body = {
  customerId: '44444444-4444-4444-8444-444444444444',
  salesChannel: 'SHOP_DIRECT',
  orderDate: '2026-08-03',
  fulfillmentStatus: 'CONFIRMED',
  paidAmount: '10.00',
  totalAmount: '999.00',
  items: [{ manualProductName: 'Fan', quantity: 1, unitPrice: '10.00', lineTotal: '999.00' }],
};

describe('sales order routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.create.mockResolvedValue(order);
    service.list.mockResolvedValue({ items: [order], total: 1, page: 1, pageSize: 25 });
    service.summary.mockResolvedValue({ salesToday: '10.00', ordersToday: 1 });
    service.cancel.mockResolvedValue({ ...order, fulfillmentStatus: 'CANCELLED' });
    inventoryService.deductStock.mockResolvedValue({ message: 'deducted', fulfillments: [] });
    inventoryService.restoreStock.mockResolvedValue({ message: 'restored', fulfillments: [] });
  });

  it('requires authentication and ignores client-calculated totals', async () => {
    expect((await request(app).post('/api/v1/sales-orders').send(body)).status).toBe(401);
    expect((await request(app).post('/api/v1/sales-orders').set('Authorization', `Bearer ${employee}`).send(body)).status).toBe(201);
    expect(service.create.mock.calls[0][0]).not.toHaveProperty('totalAmount');
    expect(service.create.mock.calls[0][0].items[0]).not.toHaveProperty('lineTotal');
  });

  it('registers summary before the id route and exposes no delete endpoint', async () => {
    expect((await request(app).get('/api/v1/sales-orders/summary').set('Authorization', `Bearer ${employee}`)).status).toBe(200);
    expect((await request(app).delete(`/api/v1/sales-orders/${orderId}`).set('Authorization', `Bearer ${admin}`)).status).toBe(404);
  });

  it('keeps cancellation and audit admin-only', async () => {
    const action = { reason: 'Customer cancelled order', accountPassword: 'password' };
    expect((await request(app).post(`/api/v1/sales-orders/${orderId}/cancel`).set('Authorization', `Bearer ${employee}`).send(action)).status).toBe(403);
    expect((await request(app).post(`/api/v1/sales-orders/${orderId}/cancel`).set('Authorization', `Bearer ${admin}`).send(action)).status).toBe(200);
    expect((await request(app).get(`/api/v1/sales-orders/${orderId}/audit`).set('Authorization', `Bearer ${employee}`)).status).toBe(403);
  });

  it('allows admin or employee deduction and rejects unknown roles and forged authority fields', async () => {
    const forged = {
      itemIds: [itemId], productId: orderId, quantity: 999,
      referenceType: 'FORGED', referenceId: orderId, accountPassword: 'ignored',
    };
    expect((await request(app).post(`/api/v1/sales-orders/${orderId}/deduct-stock`).set('Authorization', `Bearer ${employee}`).send(forged)).status).toBe(400);
    expect(inventoryService.deductStock).not.toHaveBeenCalled();
    expect((await request(app).post(`/api/v1/sales-orders/${orderId}/deduct-stock`).set('Authorization', `Bearer ${employee}`).send({ itemIds: [itemId] })).status).toBe(201);
    expect(inventoryService.deductStock.mock.calls[0][1]).toEqual({ itemIds: [itemId] });
    expect((await request(app).post(`/api/v1/sales-orders/${orderId}/deduct-stock`).set('Authorization', `Bearer ${admin}`).send({ itemIds: [itemId] })).status).toBe(201);
    expect((await request(app).post(`/api/v1/sales-orders/${orderId}/deduct-stock`).set('Authorization', `Bearer ${unknownRole}`).send({ itemIds: [itemId] })).status).toBe(403);
  });

  it('keeps restoration admin-only, password-free, and reason-required', async () => {
    const payload = { fulfillmentIds: [fulfillmentId], reason: 'Customer cancelled' };
    expect((await request(app).post(`/api/v1/sales-orders/${orderId}/restore-stock`).set('Authorization', `Bearer ${employee}`).send(payload)).status).toBe(403);
    expect((await request(app).post(`/api/v1/sales-orders/${orderId}/restore-stock`).set('Authorization', `Bearer ${admin}`).send(payload)).status).toBe(201);
    expect(inventoryService.restoreStock.mock.calls[0][1]).toEqual(payload);
    expect((await request(app).post(`/api/v1/sales-orders/${orderId}/restore-stock`).set('Authorization', `Bearer ${admin}`).send({ fulfillmentIds: [fulfillmentId], reason: ' ' })).status).toBe(400);
  });
});
