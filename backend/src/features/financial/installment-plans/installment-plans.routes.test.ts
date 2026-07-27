import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { installmentPlansServiceMock } = vi.hoisted(() => ({
  installmentPlansServiceMock: {
    createPlan: vi.fn(),
    listCustomerPlans: vi.fn(),
    getPlan: vi.fn(),
    listPlanPayments: vi.fn(),
    updatePlan: vi.fn(),
    correctPlan: vi.fn(),
    recordPlanPayment: vi.fn(),
    cancelPlan: vi.fn(),
  },
}));

vi.mock('./installment-plans.service', () => ({
  InstallmentPlansService: installmentPlansServiceMock,
}));

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
  },
  transactionModel: {},
  activityLogModel: {},
}));

const customerId = '22222222-2222-4222-8222-222222222222';
const planId = '55555555-5555-4555-8555-555555555555';
const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const adminToken = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, jwtSecret);
const employeeToken = jwt.sign({ userId: '44444444-4444-4444-8444-444444444444', role: 'EMPLOYEE' }, jwtSecret);

const planResponse = {
  id: planId,
  customer: {
    id: customerId,
    name: 'Ali Ahmad',
    phone: '70123456',
  },
  description: 'Refrigerator',
  totalAmount: '600.00',
  totalPaid: '0.00',
  remainingBalance: '600.00',
  startDate: '2026-08-01',
  installmentCount: 6,
  frequency: 'MONTHLY',
  status: 'ACTIVE',
  storedStatus: 'ACTIVE',
  nextDueDate: '2026-08-01',
  completedInstallmentCount: 0,
  overdueInstallmentCount: 0,
  notes: null,
  createdAt: '2026-07-24T09:00:00.000Z',
  updatedAt: '2026-07-24T09:00:00.000Z',
  createdBy: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Admin User',
    username: 'admin',
  },
  cancellation: null,
  schedule: [
    {
      id: '66666666-6666-4666-8666-666666666661',
      installmentNumber: 1,
      dueDate: '2026-08-01',
      amountDue: '100.00',
      totalPaid: '0.00',
      remainingAmount: '100.00',
      status: 'PENDING',
      storedStatus: 'PENDING',
      paidDate: null,
    },
  ],
  payments: [],
};

describe('installment plan routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installmentPlansServiceMock.createPlan.mockResolvedValue(planResponse);
    installmentPlansServiceMock.listCustomerPlans.mockResolvedValue({
      plans: [planResponse],
      total: 1,
      page: 1,
      limit: 10,
    });
    installmentPlansServiceMock.getPlan.mockResolvedValue(planResponse);
    installmentPlansServiceMock.listPlanPayments.mockResolvedValue([]);
    installmentPlansServiceMock.updatePlan.mockResolvedValue({
      ...planResponse,
      description: 'Updated refrigerator',
      notes: 'Updated notes',
    });
    installmentPlansServiceMock.correctPlan.mockResolvedValue({
      ...planResponse,
      description: 'Updated refrigerator',
      totalAmount: '650.00',
      notes: 'Updated notes',
    });
    installmentPlansServiceMock.recordPlanPayment.mockResolvedValue({
      ...planResponse,
      totalPaid: '150.00',
      remainingBalance: '450.00',
      schedule: [
        {
          ...planResponse.schedule[0],
          totalPaid: '100.00',
          remainingAmount: '0.00',
          status: 'PAID',
          paidDate: '2026-08-15',
        },
        {
          ...planResponse.schedule[0],
          id: '66666666-6666-4666-8666-666666666662',
          installmentNumber: 2,
          dueDate: '2026-09-01',
          totalPaid: '50.00',
          remainingAmount: '50.00',
          status: 'PARTIALLY_PAID',
        },
      ],
    });
    installmentPlansServiceMock.cancelPlan.mockResolvedValue({
      ...planResponse,
      status: 'CANCELLED',
      cancellation: {
        cancelledAt: '2026-07-24T10:00:00.000Z',
        reason: 'Agreement cancelled',
        cancelledBy: planResponse.createdBy,
      },
    });
  });

  it('requires authentication for installment plan routes', async () => {
    const response = await request(app)
      .post(`/api/v1/customers/${customerId}/installment-plans`)
      .send({
        totalAmount: '600.00',
        description: 'Refrigerator',
        startDate: '2026-08-01',
        installmentCount: 6,
        frequency: 'MONTHLY',
      });

    expect(response.status).toBe(401);
    expect(installmentPlansServiceMock.createPlan).not.toHaveBeenCalled();
  });

  it('forbids non-admin installment mutations', async () => {
    const response = await request(app)
      .post(`/api/v1/customers/${customerId}/installment-plans`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        totalAmount: '600.00',
        description: 'Refrigerator',
        startDate: '2026-08-01',
        installmentCount: 6,
        frequency: 'MONTHLY',
      });

    expect(response.status).toBe(403);
    expect(installmentPlansServiceMock.createPlan).not.toHaveBeenCalled();
  });

  it('allows admins to create plans and rejects client-provided schedules/statuses', async () => {
    const response = await request(app)
      .post(`/api/v1/customers/${customerId}/installment-plans`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        totalAmount: '600.00',
        description: 'Refrigerator',
        startDate: '2026-08-01',
        installmentCount: 6,
        frequency: 'MONTHLY',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.totalAmount).toBe('600.00');
    expect(response.body.data.schedule).toHaveLength(1);

    const invalidResponse = await request(app)
      .post(`/api/v1/customers/${customerId}/installment-plans`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        totalAmount: '600.00',
        description: 'Refrigerator',
        startDate: '2026-08-01',
        installmentCount: 6,
        frequency: 'MONTHLY',
        status: 'COMPLETED',
        installments: [],
      });

    expect(invalidResponse.status).toBe(400);
  });

  it('allows authenticated users to list and fetch plan details', async () => {
    const listResponse = await request(app)
      .get(`/api/v1/customers/${customerId}/installment-plans`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.meta.pagination.totalItems).toBe(1);

    const detailResponse = await request(app)
      .get(`/api/v1/installment-plans/${planId}`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data.id).toBe(planId);
  });

  it('allows admins to record plan payments and cancel plans', async () => {
    const paymentResponse = await request(app)
      .post(`/api/v1/installment-plans/${planId}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: '150.00',
        paymentDate: '2026-08-15',
        paymentMethod: 'CASH',
        idempotencyKey: 'route-plan-key',
      });

    expect(paymentResponse.status).toBe(201);
    expect(paymentResponse.body.data.totalPaid).toBe('150.00');

    const employeePaymentResponse = await request(app)
      .post(`/api/v1/installment-plans/${planId}/payments`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        amount: '150.00',
        paymentDate: '2026-08-15',
        paymentMethod: 'CASH',
      });

    expect(employeePaymentResponse.status).toBe(403);

    const cancelResponse = await request(app)
      .post(`/api/v1/installment-plans/${planId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'Agreement cancelled',
        accountPassword: 'admin-password',
      });

    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body.data.status).toBe('CANCELLED');
    expect(cancelResponse.body.data.cancellation.reason).toBe('Agreement cancelled');
  });

  it('allows admins to correct plan details with account password and reason', async () => {
    const response = await request(app)
      .post(`/api/v1/installment-plans/${planId}/corrections`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        totalAmount: '650.00',
        description: 'Updated refrigerator',
        startDate: '2026-08-01',
        installmentCount: 6,
        notes: 'Updated notes',
        reason: 'Corrected agreement amount',
        sourceScreen: 'PLAN_DETAILS',
        accountPassword: 'admin-password',
      });

    expect(response.status).toBe(200);
    expect(response.body.data.description).toBe('Updated refrigerator');
    expect(response.body.data.totalAmount).toBe('650.00');
    expect(installmentPlansServiceMock.correctPlan).toHaveBeenCalledWith(
      planId,
      {
        totalAmount: '650.00',
        description: 'Updated refrigerator',
        startDate: '2026-08-01',
        installmentCount: 6,
        notes: 'Updated notes',
        reason: 'Corrected agreement amount',
        sourceScreen: 'PLAN_DETAILS',
        accountPassword: 'admin-password',
      },
      expect.objectContaining({ role: 'ADMIN' })
    );
  });

  it('keeps the legacy patch plan route as a correction alias', async () => {
    const response = await request(app)
      .patch(`/api/v1/installment-plans/${planId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        description: 'Updated refrigerator',
        notes: 'Updated notes',
        reason: 'Corrected description typo',
        sourceScreen: 'PLAN_DETAILS',
        accountPassword: 'admin-password',
      });

    expect(response.status).toBe(200);
    expect(installmentPlansServiceMock.updatePlan).toHaveBeenCalledTimes(1);
  });
});
