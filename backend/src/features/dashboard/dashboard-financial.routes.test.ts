import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../app';

const { dashboardFinancialServiceMock } = vi.hoisted(() => ({
  dashboardFinancialServiceMock: {
    getFinancialSummary: vi.fn(),
  },
}));

vi.mock('./dashboard-financial.service', () => ({
  DashboardFinancialService: dashboardFinancialServiceMock,
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
  },
  transactionModel: {},
  activityLogModel: {},
}));

const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const employeeToken = jwt.sign(
  { userId: '44444444-4444-4444-8444-444444444444', role: 'EMPLOYEE' },
  jwtSecret
);

const financialSummary = {
  businessDate: '2026-07-27',
  monthStart: '2026-07-01',
  counts: {
    totalCustomers: 2,
    customersWithOutstanding: 1,
  },
  money: {
    totalOutstanding: '500.00',
    paymentsToday: '50.00',
    paymentsThisMonth: '250.00',
    obligationsCreatedToday: '100.00',
    obligationsCreatedThisMonth: '900.00',
    netChangeToday: '50.00',
    netChangeThisMonth: '650.00',
  },
  upcomingDue: [],
  overdueCustomers: [],
  recentPayments: [],
};

describe('dashboard financial routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboardFinancialServiceMock.getFinancialSummary.mockResolvedValue(financialSummary);
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/v1/dashboard/financial-summary');

    expect(response.status).toBe(401);
    expect(dashboardFinancialServiceMock.getFinancialSummary).not.toHaveBeenCalled();
  });

  it('returns authoritative financial summary for authenticated users', async () => {
    const response = await request(app)
      .get('/api/v1/dashboard/financial-summary')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.money.totalOutstanding).toBe('500.00');
    expect(response.body.data.money.paymentsThisMonth).toBe('250.00');
    expect(dashboardFinancialServiceMock.getFinancialSummary).toHaveBeenCalledOnce();
  });
});
