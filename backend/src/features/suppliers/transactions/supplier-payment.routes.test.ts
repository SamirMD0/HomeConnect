import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { transactionsService } = vi.hoisted(() => ({
  transactionsService: {
    create: vi.fn(), get: vi.fn(), list: vi.fn(), listForSupplier: vi.fn(),
    ledger: vi.fn(), update: vi.fn(), remove: vi.fn(), restore: vi.fn(),
  },
}));

vi.mock('./supplier-transactions.service', () => ({ SupplierTransactionsService: transactionsService }));
vi.mock('../../../lib/prisma', () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) },
  transactionModel: {},
  activityLogModel: {},
}));

const secret = process.env.JWT_SECRET!;
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);
const supplierId = '33333333-3333-4333-8333-333333333333';

describe('supplier payment route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionsService.create.mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      supplierId,
      amount: '125.50',
      currency: 'USD',
      paymentMethod: 'BANK_TRANSFER',
      transactionDate: '2026-10-03',
    });
  });

  it('accepts a supplier payment with currency and method', async () => {
    const payload = {
      type: 'SUPPLIER_PAYMENT',
      amount: '125.50',
      currency: 'USD',
      paymentMethod: 'BANK_TRANSFER',
      transactionDate: '2026-10-03',
      description: 'Supplier payment / دفعة مورّد',
      notes: 'Invoice 42',
    };

    const response = await request(app)
      .post(`/api/v1/suppliers/${supplierId}/transactions`)
      .set('Authorization', `Bearer ${admin}`)
      .send(payload);

    expect(response.status).toBe(201);
    expect(transactionsService.create).toHaveBeenCalledWith(
      supplierId,
      expect.objectContaining(payload),
      expect.objectContaining({ role: 'ADMIN' }),
      expect.any(Object),
    );
  });

  it('rejects a cash method whose currency does not match', async () => {
    const response = await request(app)
      .post(`/api/v1/suppliers/${supplierId}/transactions`)
      .set('Authorization', `Bearer ${admin}`)
      .send({
        type: 'SUPPLIER_PAYMENT',
        amount: '100.00',
        currency: 'LBP',
        paymentMethod: 'CASH_USD',
        transactionDate: '2026-10-03',
        description: 'Supplier payment',
      });

    expect(response.status).toBe(400);
    expect(transactionsService.create).not.toHaveBeenCalled();
  });
});
