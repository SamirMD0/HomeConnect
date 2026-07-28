import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { receivablesServiceMock } = vi.hoisted(() => ({
  receivablesServiceMock: {
    getReceivables: vi.fn(),
  },
}));

vi.mock('./receivables.service', () => ({
  ReceivablesService: receivablesServiceMock,
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

const receivablesResponse = {
  businessDate: '2026-07-28',
  summary: {
    customerCount: 0,
    customersWithBalance: 0,
    customersOverdue: 0,
    atRiskCount: 0,
    totalOutstanding: '0.00',
    totalOverdue: '0.00',
  },
  tierCounts: {
    NO_ACTIVITY: 0,
    CURRENT: 0,
    WATCH: 0,
    LATE: 0,
    SEVERE: 0,
    CRITICAL: 0,
  },
  items: [],
  pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
};

describe('receivables routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    receivablesServiceMock.getReceivables.mockResolvedValue(receivablesResponse);
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/v1/receivables');

    expect(response.status).toBe(401);
    expect(receivablesServiceMock.getReceivables).not.toHaveBeenCalled();
  });

  it('applies query defaults for authenticated users', async () => {
    const response = await request(app)
      .get('/api/v1/receivables')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(receivablesResponse);
    expect(receivablesServiceMock.getReceivables).toHaveBeenCalledWith({
      search: undefined,
      month: undefined,
      tier: [],
      onlyWithBalance: false,
      includeInactive: false,
      page: 1,
      limit: 25,
      sortBy: 'standing',
      sortOrder: 'desc',
    });
  });

  it('accepts repeated tier filters and normalizes a single tier to an array', async () => {
    await request(app)
      .get('/api/v1/receivables?tier=SEVERE&tier=CRITICAL&onlyWithBalance=true&search=ali')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(receivablesServiceMock.getReceivables).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: ['SEVERE', 'CRITICAL'],
        onlyWithBalance: true,
        search: 'ali',
      })
    );

    await request(app)
      .get('/api/v1/receivables?tier=WATCH')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(receivablesServiceMock.getReceivables).toHaveBeenLastCalledWith(
      expect.objectContaining({ tier: ['WATCH'] })
    );
  });

  it('accepts a YYYY-MM month filter and rejects a malformed one', async () => {
    await request(app)
      .get('/api/v1/receivables?month=2026-07')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(receivablesServiceMock.getReceivables).toHaveBeenCalledWith(
      expect.objectContaining({ month: '2026-07' })
    );

    for (const badMonth of ['2026-13', '2026-7', 'July', '2026-07-01']) {
      const response = await request(app)
        .get(`/api/v1/receivables?month=${badMonth}`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.status).toBe(400);
    }

    expect(receivablesServiceMock.getReceivables).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid query parameters', async () => {
    const response = await request(app)
      .get('/api/v1/receivables?tier=LEGACY')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(response.status).toBe(400);
    expect(receivablesServiceMock.getReceivables).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range limit', async () => {
    const response = await request(app)
      .get('/api/v1/receivables?limit=500')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(response.status).toBe(400);
    expect(receivablesServiceMock.getReceivables).not.toHaveBeenCalled();
  });
});
