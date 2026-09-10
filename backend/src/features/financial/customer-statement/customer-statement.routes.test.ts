import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { serviceMock } = vi.hoisted(() => ({ serviceMock: { get: vi.fn() } }));
vi.mock('./customer-statement.service', () => ({ CustomerStatementService: serviceMock }));
vi.mock('../../../lib/prisma', () => ({ prisma: { $queryRaw: vi.fn() }, transactionModel: {}, activityLogModel: {} }));

const customerId = '22222222-2222-4222-8222-222222222222';
const token = jwt.sign({ userId: '44444444-4444-4444-8444-444444444444', role: 'EMPLOYEE' }, process.env.JWT_SECRET!);

describe('customer statement route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMock.get.mockResolvedValue({ customer: { id: customerId }, openingBalance: '0.00', entries: [], closingBalance: '0.00' });
  });

  it('requires authentication', async () => {
    expect((await request(app).get(`/api/v1/customers/${customerId}/statement?from=2026-01-01&to=2026-01-31`)).status).toBe(401);
    expect(serviceMock.get).not.toHaveBeenCalled();
  });

  it('returns a date-ranged statement for an authenticated employee', async () => {
    const response = await request(app)
      .get(`/api/v1/customers/${customerId}/statement?from=2026-01-01&to=2026-01-31`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.closingBalance).toBe('0.00');
    expect(serviceMock.get).toHaveBeenCalledWith(customerId, { from: '2026-01-01', to: '2026-01-31' });
  });

  it('rejects missing, inverted, and invalid calendar date ranges', async () => {
    for (const query of ['to=2026-01-31', 'from=2026-02-01&to=2026-01-31', 'from=2026-02-31&to=2026-03-01']) {
      const response = await request(app)
        .get(`/api/v1/customers/${customerId}/statement?${query}`)
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(400);
    }
    expect(serviceMock.get).not.toHaveBeenCalled();
  });
});
