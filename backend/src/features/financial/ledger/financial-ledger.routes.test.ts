import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { ledgerServiceMock } = vi.hoisted(() => ({
  ledgerServiceMock: {
    getFinancialLedger: vi.fn(),
  },
}));

vi.mock('./financial-ledger.service', () => ({
  FinancialLedgerService: ledgerServiceMock,
}));

vi.mock('../../../lib/prisma', () => ({
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

const ledgerResponse = {
  summary: {
    basis: 'filtered',
    totalOutstanding: '0.00',
    totalPaid: '0.00',
    activeDebtCount: 0,
    activePlanCount: 0,
    activeCustomerCount: 0,
    overdueDebtCount: 0,
    overdueInstallmentCount: 0,
  },
  items: [],
  pagination: {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  },
};

describe('financial ledger routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ledgerServiceMock.getFinancialLedger.mockResolvedValue(ledgerResponse);
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/v1/financial-ledger');

    expect(response.status).toBe(401);
    expect(ledgerServiceMock.getFinancialLedger).not.toHaveBeenCalled();
  });

  it('allows authenticated users to read the global ledger with filters', async () => {
    const response = await request(app)
      .get(
        '/api/v1/financial-ledger?type=DEBT&status=ACTIVE&search=ali&dueFrom=2026-08-01&includeCancelled=true&page=2&limit=10&sortBy=customer&sortOrder=desc'
      )
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(ledgerServiceMock.getFinancialLedger).toHaveBeenCalledWith({
      type: 'DEBT',
      status: 'ACTIVE',
      search: 'ali',
      dueFrom: '2026-08-01',
      dueTo: undefined,
      paymentFrom: undefined,
      paymentTo: undefined,
      includeCancelled: true,
      includeCompleted: false,
      correctedOnly: false,
      page: 2,
      limit: 10,
      sortBy: 'customer',
      sortOrder: 'desc',
    });
  });

  it('rejects invalid query parameters', async () => {
    const response = await request(app)
      .get('/api/v1/financial-ledger?type=LEGACY')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(response.status).toBe(400);
    expect(ledgerServiceMock.getFinancialLedger).not.toHaveBeenCalled();
  });
});
