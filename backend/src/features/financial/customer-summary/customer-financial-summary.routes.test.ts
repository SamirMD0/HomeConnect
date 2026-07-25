import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { summaryServiceMock } = vi.hoisted(() => ({
  summaryServiceMock: {
    getCustomerFinancialSummary: vi.fn(),
  },
}));

vi.mock('./customer-financial-summary.service', () => ({
  CustomerFinancialSummaryService: summaryServiceMock,
}));

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
  },
  transactionModel: {},
  activityLogModel: {},
}));

const customerId = '22222222-2222-4222-8222-222222222222';
const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const employeeToken = jwt.sign(
  { userId: '44444444-4444-4444-8444-444444444444', role: 'EMPLOYEE' },
  jwtSecret
);

const summaryResponse = {
  customer: {
    id: customerId,
    name: 'Ali Ahmad',
    phone: '70123456',
    address: null,
    notes: null,
    isActive: true,
  },
  summary: {
    totalOutstanding: '850.00',
    singleDebtOutstanding: '400.00',
    installmentPlanOutstanding: '450.00',
    totalPaid: '350.00',
    activeDebtCount: 1,
    activePlanCount: 1,
    overdueDebtCount: 0,
    overdueInstallmentCount: 0,
    nextDueDate: '2026-08-10',
    nextDueAmount: '500.00',
  },
  debts: [],
  installmentPlans: [],
  overdueItems: [],
  nextDue: {
    date: '2026-08-10',
    totalAmount: '500.00',
    items: [],
  },
  recentPayments: [],
};

describe('customer financial summary routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    summaryServiceMock.getCustomerFinancialSummary.mockResolvedValue(summaryResponse);
  });

  it('requires authentication', async () => {
    const response = await request(app).get(
      `/api/v1/customers/${customerId}/financial-summary`
    );

    expect(response.status).toBe(401);
    expect(summaryServiceMock.getCustomerFinancialSummary).not.toHaveBeenCalled();
  });

  it('allows authenticated users to read the customer summary', async () => {
    const response = await request(app)
      .get(
        `/api/v1/customers/${customerId}/financial-summary?includeCancelled=true&includePayments=false&paymentLimit=5&debtLimit=6&planLimit=7`
      )
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.summary.totalOutstanding).toBe('850.00');
    expect(summaryServiceMock.getCustomerFinancialSummary).toHaveBeenCalledWith(customerId, {
      includeCancelled: true,
      includePayments: false,
      paymentLimit: 5,
      debtLimit: 6,
      planLimit: 7,
    });
  });

  it('rejects invalid summary query parameters', async () => {
    const response = await request(app)
      .get(`/api/v1/customers/${customerId}/financial-summary?paymentLimit=101`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(response.status).toBe(400);
    expect(summaryServiceMock.getCustomerFinancialSummary).not.toHaveBeenCalled();
  });
});
