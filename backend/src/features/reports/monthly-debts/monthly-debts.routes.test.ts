import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { reportsServiceMock } = vi.hoisted(() => ({
  reportsServiceMock: {
    getMonthlyDebtReport: vi.fn(),
    getMonthlyDebtCsv: vi.fn(),
    getMonthlyFinancialActivity: vi.fn(),
    getMonthlyFinancialActivityCsv: vi.fn(),
  },
}));

vi.mock('./monthly-debts.service', () => ({
  MonthlyDebtsService: reportsServiceMock,
}));

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
  },
  transactionModel: {},
  activityLogModel: {},
}));

const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const adminToken = jwt.sign(
  { userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' },
  jwtSecret
);
const employeeToken = jwt.sign(
  { userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' },
  jwtSecret
);

const reportResponse = {
  mode: 'SNAPSHOT',
  summary: {
    month: '2026-07',
    cutoffDate: '2026-07-31',
    customerCount: 0,
    totalOutstanding: '0.00',
    singleDebtOutstandingTotal: '0.00',
    installmentPlanOutstandingTotal: '0.00',
    totalAmountDueByCutoff: '0.00',
    totalOverdueAtCutoff: '0.00',
    totalPaymentsReceivedDuringMonth: '0.00',
    customersWithOverdueDebt: 0,
    customersWithActiveInstallmentPlans: 0,
  },
  rows: [],
  pagination: { page: 1, limit: 50, total: 0, totalPages: 1 },
};

describe('monthly debts report routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reportsServiceMock.getMonthlyDebtReport.mockResolvedValue(reportResponse);
    reportsServiceMock.getMonthlyDebtCsv.mockResolvedValue({
      filename: 'monthly-debts-2026-07.csv',
      csv: '\uFEFFCustomer Name\r\n',
    });
    reportsServiceMock.getMonthlyFinancialActivity.mockResolvedValue({
      summary: {
        month: '2026-07',
        startDate: '2026-07-01',
        endDate: '2026-07-31',
        newSingleDebtAmount: '0.00',
        newInstallmentPlanAmount: '0.00',
        paymentsReceived: '0.00',
        netFinancialChange: '0.00',
        debtsCreated: 0,
        plansCreated: 0,
        payments: 0,
        customerCountAffected: 0,
      },
      items: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 1 },
    });
    reportsServiceMock.getMonthlyFinancialActivityCsv.mockResolvedValue({
      filename: 'monthly-financial-activity-2026-07.csv',
      csv: '\uFEFFDate,Customer\r\n',
    });
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/v1/reports/monthly-debts?month=2026-07');

    expect(response.status).toBe(401);
    expect(reportsServiceMock.getMonthlyDebtReport).not.toHaveBeenCalled();
  });

  it('restricts monthly reports to admins', async () => {
    const response = await request(app)
      .get('/api/v1/reports/monthly-debts?month=2026-07')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(response.status).toBe(403);
    expect(reportsServiceMock.getMonthlyDebtReport).not.toHaveBeenCalled();
  });

  it('passes strict monthly debt filters to the service for admins', async () => {
    const response = await request(app)
      .get(
        '/api/v1/reports/monthly-debts?month=2026-07&includeZero=true&includeCancelled=true&search=ali&page=2&limit=25&sortBy=CUSTOMER&sortOrder=ASC'
      )
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(reportsServiceMock.getMonthlyDebtReport).toHaveBeenCalledWith({
      month: '2026-07',
      mode: 'SNAPSHOT',
      includeZero: true,
      includeCancelled: true,
      overdueOnly: false,
      search: 'ali',
      page: 2,
      limit: 25,
      sortBy: 'CUSTOMER',
      sortOrder: 'ASC',
    });
  });

  it('rejects invalid months', async () => {
    const response = await request(app)
      .get('/api/v1/reports/monthly-debts?month=2026-7')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(400);
    expect(reportsServiceMock.getMonthlyDebtReport).not.toHaveBeenCalled();
  });

  it('exports CSV with download headers', async () => {
    const response = await request(app)
      .get('/api/v1/reports/monthly-debts/export.csv?month=2026-07')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('monthly-debts-2026-07.csv');
    expect(response.text).toContain('Customer Name');
  });

  it('serves monthly financial activity for admins', async () => {
    const response = await request(app)
      .get('/api/v1/reports/monthly-financial-activity?month=2026-07')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(reportsServiceMock.getMonthlyFinancialActivity).toHaveBeenCalledWith({
      month: '2026-07',
      customerId: undefined,
      page: 1,
      limit: 50,
    });
  });

  it('exports monthly financial activity CSV with download headers', async () => {
    const response = await request(app)
      .get('/api/v1/reports/monthly-financial-activity/export.csv?month=2026-07')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('monthly-financial-activity-2026-07.csv');
  });
});
