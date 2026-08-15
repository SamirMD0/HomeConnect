import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { service } = vi.hoisted(() => ({
  service: { create: vi.fn(), listForSupplier: vi.fn(), get: vi.fn(), receiptCheck: vi.fn() },
}));
vi.mock('./supplier-purchases.service', () => ({ SupplierPurchasesService: service }));
vi.mock('../../../lib/prisma', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) }, transactionModel: {}, activityLogModel: {} }));

import { app } from '../../../app';

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);
const supplierId = '55555555-5555-4555-8555-555555555555';
const purchaseId = '44444444-4444-4444-8444-444444444444';
const productId = '02880843-6f16-93fb-2ecc-091af51a07b4';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const today = () => new Date().toISOString().slice(0, 10);
const body = () => ({
  receiptNumber: 'INV-2291',
  transactionDate: today(),
  description: 'TCL AC purchase',
  lines: [{ kind: 'EXISTING_PRODUCT', productId, quantity: 3, unitPrice: '210.00' }],
});

describe('supplier purchase routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BUSINESS_TIMEZONE = 'Asia/Beirut';
    service.create.mockResolvedValue({ id: purchaseId });
    service.listForSupplier.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });
    service.get.mockResolvedValue({ id: purchaseId });
    service.receiptCheck.mockResolvedValue({ duplicate: false, matches: [] });
  });

  it('lets an admin post a purchase', async () => {
    const response = await request(app).post(`/api/v1/suppliers/${supplierId}/purchases`).set(auth(admin)).send(body());
    expect(response.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(supplierId, expect.objectContaining({ receiptNumber: 'INV-2291' }), expect.objectContaining({ role: 'ADMIN' }), expect.any(Object));
  });

  /**
   * A purchase writes both stock and the supplier ledger, so it takes the
   * stricter of the two guards. Employees keep the standalone receiving route.
   */
  it('refuses an employee, who keeps the standalone receiving route instead', async () => {
    expect((await request(app).post(`/api/v1/suppliers/${supplierId}/purchases`).set(auth(employee)).send(body())).status).toBe(403);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    expect((await request(app).post(`/api/v1/suppliers/${supplierId}/purchases`).send(body())).status).toBe(401);
    expect((await request(app).get('/api/v1/supplier-purchases/receipt-check')).status).toBe(401);
  });

  it('rejects an invalid body before reaching the service', async () => {
    const response = await request(app).post(`/api/v1/suppliers/${supplierId}/purchases`).set(auth(admin)).send({ ...body(), lines: [] });
    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('registers receipt-check before the id route', async () => {
    const url = `/api/v1/supplier-purchases/receipt-check?supplierId=${supplierId}&receiptNumber=INV-1`;
    expect((await request(app).get(url).set(auth(employee))).status).toBe(200);
    expect(service.receiptCheck).toHaveBeenCalledWith({ supplierId, receiptNumber: 'INV-1' });
    expect(service.get).not.toHaveBeenCalled();
  });

  it('lets any authenticated user read purchases', async () => {
    expect((await request(app).get(`/api/v1/suppliers/${supplierId}/purchases`).set(auth(employee))).status).toBe(200);
    expect((await request(app).get(`/api/v1/supplier-purchases/${purchaseId}`).set(auth(employee))).status).toBe(200);
  });

  it('exposes no edit or delete route for a posted purchase', async () => {
    expect((await request(app).patch(`/api/v1/supplier-purchases/${purchaseId}`).set(auth(admin)).send({})).status).toBe(404);
    expect((await request(app).delete(`/api/v1/supplier-purchases/${purchaseId}`).set(auth(admin))).status).toBe(404);
  });

  it('does not shadow the existing supplier detail route', async () => {
    // The purchase router is mounted on /suppliers ahead of suppliersRoutes, so
    // it must claim only the /purchases suffix and let a plain supplier fetch
    // fall through to the router that owns it.
    await request(app).get(`/api/v1/suppliers/${supplierId}`).set(auth(employee));
    expect(service.listForSupplier).not.toHaveBeenCalled();
    expect(service.get).not.toHaveBeenCalled();
  });
});
