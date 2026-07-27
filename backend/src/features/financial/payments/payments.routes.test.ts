import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { paymentsServiceMock } = vi.hoisted(() => ({
  paymentsServiceMock: {
    voidPayment: vi.fn(),
    correctPayment: vi.fn(),
    reallocatePayment: vi.fn(),
  },
}));

vi.mock('./payments.service', () => ({
  PaymentsService: paymentsServiceMock,
}));

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
  },
  transactionModel: {},
  activityLogModel: {},
}));

const paymentId = '55555555-5555-4555-8555-555555555555';
const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const adminToken = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, jwtSecret);
const employeeToken = jwt.sign({ userId: '44444444-4444-4444-8444-444444444444', role: 'EMPLOYEE' }, jwtSecret);

describe('payment correction routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paymentsServiceMock.voidPayment.mockResolvedValue({
      paymentId,
      customerId: '22222222-2222-4222-8222-222222222222',
      action: 'VOID_PAYMENT',
      replacementPaymentId: null,
      voidedAt: '2026-07-27T10:00:00.000Z',
    });
    paymentsServiceMock.correctPayment.mockResolvedValue({
      paymentId,
      customerId: '22222222-2222-4222-8222-222222222222',
      action: 'CORRECT_DETAILS',
      replacementPaymentId: null,
      voidedAt: null,
    });
    paymentsServiceMock.reallocatePayment.mockResolvedValue({
      paymentId,
      customerId: '22222222-2222-4222-8222-222222222222',
      action: 'REALLOCATE_PAYMENT',
      replacementPaymentId: null,
      voidedAt: null,
    });
  });

  it('requires admin access to void payments', async () => {
    const response = await request(app)
      .post(`/api/v1/payments/${paymentId}/void`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        reason: 'Wrong payment was entered',
        accountPassword: 'admin-password',
      });

    expect(response.status).toBe(403);
    expect(paymentsServiceMock.voidPayment).not.toHaveBeenCalled();
  });

  it('voids a payment with reason and account password', async () => {
    const response = await request(app)
      .post(`/api/v1/payments/${paymentId}/void`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'Wrong payment was entered',
        sourceScreen: 'LEDGER',
        accountPassword: 'admin-password',
      });

    expect(response.status).toBe(200);
    expect(response.body.data.action).toBe('VOID_PAYMENT');
    expect(paymentsServiceMock.voidPayment).toHaveBeenCalledWith(
      paymentId,
      {
        reason: 'Wrong payment was entered',
        sourceScreen: 'LEDGER',
        accountPassword: 'admin-password',
      },
      expect.objectContaining({ role: 'ADMIN' })
    );
  });

  it('corrects payment metadata through the correction endpoint', async () => {
    const response = await request(app)
      .post(`/api/v1/payments/${paymentId}/corrections`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        paymentDate: '2026-07-27',
        paymentMethod: 'CASH',
        reference: 'receipt-2',
        notes: 'Corrected reference',
        reason: 'Receipt reference was mistyped',
        sourceScreen: 'LEDGER',
        accountPassword: 'admin-password',
      });

    expect(response.status).toBe(200);
    expect(paymentsServiceMock.correctPayment).toHaveBeenCalledTimes(1);
  });

  it('reallocates installment payment allocations through the reallocation endpoint', async () => {
    const response = await request(app)
      .post(`/api/v1/payments/${paymentId}/reallocate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        allocations: [
          {
            installmentId: '99999999-9999-4999-8999-999999999991',
            amount: '120.00',
          },
          {
            installmentId: '99999999-9999-4999-8999-999999999992',
            amount: '80.00',
          },
        ],
        reason: 'Payment was allocated to the wrong installments',
        sourceScreen: 'PLAN_DETAILS',
        accountPassword: 'admin-password',
      });

    expect(response.status).toBe(200);
    expect(response.body.data.action).toBe('REALLOCATE_PAYMENT');
    expect(paymentsServiceMock.reallocatePayment).toHaveBeenCalledWith(
      paymentId,
      {
        allocations: [
          {
            installmentId: '99999999-9999-4999-8999-999999999991',
            amount: '120.00',
          },
          {
            installmentId: '99999999-9999-4999-8999-999999999992',
            amount: '80.00',
          },
        ],
        reason: 'Payment was allocated to the wrong installments',
        sourceScreen: 'PLAN_DETAILS',
        accountPassword: 'admin-password',
      },
      expect.objectContaining({ role: 'ADMIN' })
    );
  });

  it('rejects duplicate target installments in reallocation requests', async () => {
    const response = await request(app)
      .post(`/api/v1/payments/${paymentId}/reallocate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        allocations: [
          {
            installmentId: '99999999-9999-4999-8999-999999999991',
            amount: '120.00',
          },
          {
            installmentId: '99999999-9999-4999-8999-999999999991',
            amount: '80.00',
          },
        ],
        reason: 'Payment was allocated to the wrong installments',
        sourceScreen: 'PLAN_DETAILS',
        accountPassword: 'admin-password',
      });

    expect(response.status).toBe(400);
    expect(paymentsServiceMock.reallocatePayment).not.toHaveBeenCalled();
  });
});
