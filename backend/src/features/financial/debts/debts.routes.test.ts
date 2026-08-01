import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { debtsServiceMock } = vi.hoisted(() => ({
  debtsServiceMock: {
    createDebt: vi.fn(),
    createPrepaidPurchase: vi.fn(),
    listCustomerDebts: vi.fn(),
    getDebt: vi.fn(),
    listDebtPayments: vi.fn(),
    updateDebt: vi.fn(),
    correctDebt: vi.fn(),
    recordDebtPayment: vi.fn(),
    cancelDebt: vi.fn(),
  },
}));

vi.mock('./debts.service', () => ({
  DebtsService: debtsServiceMock,
}));

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
  },
  transactionModel: {},
  activityLogModel: {},
}));

const customerId = '22222222-2222-4222-8222-222222222222';
const debtId = '33333333-3333-4333-8333-333333333333';
const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const adminToken = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, jwtSecret);
const employeeToken = jwt.sign({ userId: '44444444-4444-4444-8444-444444444444', role: 'EMPLOYEE' }, jwtSecret);

const debtResponse = {
  id: debtId,
  kind: 'STANDARD',
  customer: {
    id: customerId,
    name: 'Ali Ahmad',
    phone: '70123456',
  },
  description: 'Refrigerator',
  originalAmount: '600.00',
  totalPaid: '0.00',
  remainingBalance: '600.00',
  dueDate: '2026-08-10',
  status: 'UNPAID',
  storedStatus: 'UNPAID',
  notes: null,
  createdAt: '2026-07-24T09:00:00.000Z',
  updatedAt: '2026-07-24T09:00:00.000Z',
  createdBy: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Admin User',
    username: 'admin',
  },
  cancellation: null,
  payments: [],
};

describe('debt routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    debtsServiceMock.createDebt.mockResolvedValue(debtResponse);
    debtsServiceMock.createPrepaidPurchase.mockResolvedValue({
      ...debtResponse,
      kind: 'PREPAID_PURCHASE',
      description: 'Air conditioner',
      originalAmount: '400.00',
      totalPaid: '100.00',
      remainingBalance: '300.00',
      status: 'PARTIALLY_PAID',
    });
    debtsServiceMock.listCustomerDebts.mockResolvedValue({
      debts: [debtResponse],
      total: 1,
      page: 1,
      limit: 10,
    });
    debtsServiceMock.getDebt.mockResolvedValue(debtResponse);
    debtsServiceMock.listDebtPayments.mockResolvedValue([]);
    debtsServiceMock.updateDebt.mockResolvedValue({
      ...debtResponse,
      description: 'Updated refrigerator',
      originalAmount: '650.00',
      dueDate: '2026-08-15',
      notes: 'Updated notes',
    });
    debtsServiceMock.correctDebt.mockResolvedValue({
      ...debtResponse,
      description: 'Updated refrigerator',
      originalAmount: '650.00',
      dueDate: '2026-08-15',
      notes: 'Updated notes',
    });
    debtsServiceMock.recordDebtPayment.mockResolvedValue({
      ...debtResponse,
      totalPaid: '200.00',
      remainingBalance: '400.00',
      status: 'PARTIALLY_PAID',
    });
    debtsServiceMock.cancelDebt.mockResolvedValue({
      ...debtResponse,
      status: 'CANCELLED',
      cancellation: {
        cancelledAt: '2026-07-24T10:00:00.000Z',
        reason: 'Customer returned product',
        cancelledBy: debtResponse.createdBy,
      },
    });
  });

  it('requires authentication for debt routes', async () => {
    const response = await request(app)
      .post(`/api/v1/customers/${customerId}/debts`)
      .send({
        amount: '600.00',
        description: 'Refrigerator',
        dueDate: '2026-08-10',
      });

    expect(response.status).toBe(401);
    expect(debtsServiceMock.createDebt).not.toHaveBeenCalled();
  });

  it('forbids non-admin debt mutations', async () => {
    const response = await request(app)
      .post(`/api/v1/customers/${customerId}/debts`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        amount: '600.00',
        description: 'Refrigerator',
        dueDate: '2026-08-10',
      });

    expect(response.status).toBe(403);
    expect(debtsServiceMock.createDebt).not.toHaveBeenCalled();
  });

  it('allows admins to create debts and rejects unknown financial fields', async () => {
    const response = await request(app)
      .post(`/api/v1/customers/${customerId}/debts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: '600.00',
        description: 'Refrigerator',
        dueDate: '2026-08-10',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.originalAmount).toBe('600.00');
    expect(debtsServiceMock.createDebt).toHaveBeenCalledTimes(1);

    const invalidResponse = await request(app)
      .post(`/api/v1/customers/${customerId}/debts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: '600.00',
        description: 'Refrigerator',
        dueDate: '2026-08-10',
        status: 'PAID',
      });

    expect(invalidResponse.status).toBe(400);
  });

  it('allows admins to create prepaid purchases and validates overpayment', async () => {
    const response = await request(app)
      .post(`/api/v1/customers/${customerId}/prepaid-purchases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        itemName: 'Air conditioner',
        paymentAmount: '100.00',
        fullAmount: '400.00',
        notes: 'Customer will collect later',
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      kind: 'PREPAID_PURCHASE',
      totalPaid: '100.00',
      remainingBalance: '300.00',
    });
    expect(debtsServiceMock.createPrepaidPurchase).toHaveBeenCalledTimes(1);

    const invalidResponse = await request(app)
      .post(`/api/v1/customers/${customerId}/prepaid-purchases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        itemName: 'Air conditioner',
        paymentAmount: '500.00',
        fullAmount: '400.00',
      });

    expect(invalidResponse.status).toBe(400);
  });

  it('allows authenticated users to list and fetch debt details', async () => {
    const listResponse = await request(app)
      .get(`/api/v1/customers/${customerId}/debts`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.meta.pagination.totalItems).toBe(1);

    const detailResponse = await request(app)
      .get(`/api/v1/debts/${debtId}`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data.id).toBe(debtId);
  });

  it('allows admins to record payments and cancel debts', async () => {
    const paymentResponse = await request(app)
      .post(`/api/v1/debts/${debtId}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: '200.00',
        paymentDate: '2026-07-24',
        paymentMethod: 'CASH',
        idempotencyKey: 'route-key-123',
      });

    expect(paymentResponse.status).toBe(201);
    expect(paymentResponse.body.data.status).toBe('PARTIALLY_PAID');

    const employeePaymentResponse = await request(app)
      .post(`/api/v1/debts/${debtId}/payments`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        amount: '200.00',
        paymentDate: '2026-07-24',
        paymentMethod: 'CASH',
      });

    expect(employeePaymentResponse.status).toBe(403);

    const cancelResponse = await request(app)
      .post(`/api/v1/debts/${debtId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'Customer returned product',
        accountPassword: 'admin-password',
      });

    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body.data.status).toBe('CANCELLED');
    expect(cancelResponse.body.data.cancellation.reason).toBe('Customer returned product');
  });

  it('allows admins to correct debt details and amount with account password', async () => {
    const response = await request(app)
      .post(`/api/v1/debts/${debtId}/corrections`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        originalAmount: '650.00',
        description: 'Updated refrigerator',
        dueDate: '2026-08-15',
        notes: 'Updated notes',
        reason: 'Original invoice amount was entered incorrectly',
        sourceScreen: 'CUSTOMER_PROFILE',
        accountPassword: 'admin-password',
      });

    expect(response.status).toBe(200);
    expect(response.body.data.description).toBe('Updated refrigerator');
    expect(response.body.data.originalAmount).toBe('650.00');
    expect(debtsServiceMock.correctDebt).toHaveBeenCalledWith(
      debtId,
      {
        originalAmount: '650.00',
        description: 'Updated refrigerator',
        dueDate: '2026-08-15',
        notes: 'Updated notes',
        reason: 'Original invoice amount was entered incorrectly',
        sourceScreen: 'CUSTOMER_PROFILE',
        accountPassword: 'admin-password',
      },
      expect.objectContaining({ role: 'ADMIN' })
    );
  });

  it('keeps the legacy patch debt route as a correction alias', async () => {
    const response = await request(app)
      .patch(`/api/v1/debts/${debtId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        description: 'Updated refrigerator',
        dueDate: '2026-08-15',
        notes: 'Updated notes',
        reason: 'Corrected description typo',
        sourceScreen: 'CUSTOMER_PROFILE',
        accountPassword: 'admin-password',
      });

    expect(response.status).toBe(200);
    expect(debtsServiceMock.updateDebt).toHaveBeenCalledTimes(1);
  });
});
