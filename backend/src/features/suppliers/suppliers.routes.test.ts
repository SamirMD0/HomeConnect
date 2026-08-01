import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../app';

const { suppliersService, transactionsService } = vi.hoisted(() => ({
  suppliersService: { create: vi.fn(), list: vi.fn(), get: vi.fn(), summary: vi.fn(), update: vi.fn(), archive: vi.fn(), restore: vi.fn(), delete: vi.fn(), audit: vi.fn() },
  transactionsService: { create: vi.fn(), get: vi.fn(), list: vi.fn(), listForSupplier: vi.fn(), ledger: vi.fn(), update: vi.fn(), remove: vi.fn(), restore: vi.fn() },
}));
vi.mock('./suppliers/suppliers.service', () => ({ SuppliersService: suppliersService }));
vi.mock('./transactions/supplier-transactions.service', () => ({ SupplierTransactionsService: transactionsService }));
vi.mock('../../lib/prisma', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) }, transactionModel: {}, activityLogModel: {} }));

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);
const supplierId = '33333333-3333-4333-8333-333333333333';
const transactionId = '44444444-4444-4444-8444-444444444444';

describe('supplier routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    suppliersService.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });
    suppliersService.create.mockResolvedValue({ id: supplierId });
    suppliersService.get.mockResolvedValue({ id: supplierId });
    suppliersService.archive.mockResolvedValue({ id: supplierId, isActive: false });
    transactionsService.listForSupplier.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });
    transactionsService.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });
    transactionsService.create.mockResolvedValue({ id: transactionId });
    transactionsService.ledger.mockResolvedValue({ summary: {}, items: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } });
  });

  it('requires authentication and permits authenticated reads', async () => {
    expect((await request(app).get('/api/v1/suppliers')).status).toBe(401);
    expect((await request(app).get('/api/v1/suppliers').set('Authorization', `Bearer ${employee}`)).status).toBe(200);
    expect((await request(app).get('/api/v1/supplier-ledger').set('Authorization', `Bearer ${employee}`)).status).toBe(200);
  });

  it('allows only administrators to create and archive suppliers', async () => {
    const payload = { name: 'شركة النور', phone: '70123456' };
    expect((await request(app).post('/api/v1/suppliers').set('Authorization', `Bearer ${employee}`).send(payload)).status).toBe(403);
    expect((await request(app).post('/api/v1/suppliers').set('Authorization', `Bearer ${admin}`).send(payload)).status).toBe(201);
    const action = { reason: 'No longer trading', accountPassword: 'secret' };
    expect((await request(app).post(`/api/v1/suppliers/${supplierId}/archive`).set('Authorization', `Bearer ${employee}`).send(action)).status).toBe(403);
    expect((await request(app).post(`/api/v1/suppliers/${supplierId}/archive`).set('Authorization', `Bearer ${admin}`).send(action)).status).toBe(200);
  });

  it('registers supplier transaction subresources before the supplier id route', async () => {
    const response = await request(app).get(`/api/v1/suppliers/${supplierId}/transactions`).set('Authorization', `Bearer ${employee}`);
    expect(response.status).toBe(200);
    expect(transactionsService.listForSupplier).toHaveBeenCalledWith(supplierId, expect.objectContaining({ includeRemoved: false }));
    expect(suppliersService.get).not.toHaveBeenCalled();
  });

  it('registers the global transaction list before transaction detail', async () => {
    const response = await request(app).get('/api/v1/supplier-transactions?page=1').set('Authorization', `Bearer ${employee}`);
    expect(response.status).toBe(200);
    expect(transactionsService.list).toHaveBeenCalled();
    expect(transactionsService.get).not.toHaveBeenCalled();
  });

  it('validates adjustment direction and protects transaction creation', async () => {
    const payload = { type: 'SUPPLIER_ADJUSTMENT', amount: '25.00', transactionDate: '2026-07-29', description: 'Opening correction' };
    expect((await request(app).post(`/api/v1/suppliers/${supplierId}/transactions`).set('Authorization', `Bearer ${employee}`).send(payload)).status).toBe(403);
    expect((await request(app).post(`/api/v1/suppliers/${supplierId}/transactions`).set('Authorization', `Bearer ${admin}`).send(payload)).status).toBe(400);
  });
});
