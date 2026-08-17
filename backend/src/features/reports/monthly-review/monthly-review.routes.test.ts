import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { service } = vi.hoisted(() => ({ service: { get: vi.fn(), exportCsv: vi.fn() } }));
vi.mock('./monthly-review.service', () => ({ MonthlyReviewService: service }));
vi.mock('../../../lib/prisma', () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) },
  transactionModel: {},
  activityLogModel: {},
}));

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);
const envelope = {
  meta: {
    from: '2026-07-01', to: '2026-07-31', previousFrom: '2026-05-31',
    previousTo: '2026-06-30', preset: 'lastMonth', generatedAt: '2026-08-17T08:00:00.000Z', currency: 'USD',
  },
  data: { sales: {}, customers: {}, suppliers: {}, inventory: {}, risk: {} },
};

describe('monthly review route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.get.mockResolvedValue(envelope);
    service.exportCsv.mockResolvedValue({ filename: 'monthly-review.csv', csv: '\uFEFFDomain,Metric,Value\r\n' });
  });

  it('requires authentication and ADMIN access', async () => {
    expect((await request(app).get('/api/v1/reports/monthly-review')).status).toBe(401);
    expect((await request(app).get('/api/v1/reports/monthly-review').set('Authorization', `Bearer ${employee}`)).status).toBe(403);
    expect(service.get).not.toHaveBeenCalled();
  });

  it('returns the reports meta and five-domain data envelope for admins', async () => {
    const response = await request(app)
      .get('/api/v1/reports/monthly-review?period=lastMonth')
      .set('Authorization', `Bearer ${admin}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, ...envelope });
    expect(service.get).toHaveBeenCalledWith({ period: 'lastMonth', from: undefined, to: undefined });
  });

  it('validates custom business-date ranges before calling the service', async () => {
    const missing = await request(app)
      .get('/api/v1/reports/monthly-review?period=custom&from=2026-07-01')
      .set('Authorization', `Bearer ${admin}`);
    const invalid = await request(app)
      .get('/api/v1/reports/monthly-review?period=custom&from=2026-02-30&to=2026-03-01')
      .set('Authorization', `Bearer ${admin}`);
    const reversed = await request(app)
      .get('/api/v1/reports/monthly-review?period=custom&from=2026-07-20&to=2026-07-10')
      .set('Authorization', `Bearer ${admin}`);

    expect([missing.status, invalid.status, reversed.status]).toEqual([400, 400, 400]);
    expect(service.get).not.toHaveBeenCalled();
  });

  it('exports ADMIN-only CSV with the shared download headers', async () => {
    expect((await request(app).get('/api/v1/reports/monthly-review/export.csv')).status).toBe(401);
    const response = await request(app).get('/api/v1/reports/monthly-review/export.csv?period=lastMonth').set('Authorization', `Bearer ${admin}`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('monthly-review.csv');
  });
});
