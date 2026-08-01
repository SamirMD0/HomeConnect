import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../app';

const { service } = vi.hoisted(() => ({
  service: {
    overview: vi.fn(), customerFinancial: vi.fn(), supplierFinancial: vi.fn(),
    serviceSummary: vi.fn(), productSummary: vi.fn(), alerts: vi.fn(), activity: vi.fn(), monthEnd: vi.fn(),
  },
}));
vi.mock('./dashboard.service', () => ({ DashboardAnalyticsService: service }));
vi.mock('../../lib/prisma', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) }, transactionModel: {}, activityLogModel: {} }));

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const employee = jwt.sign({ userId: '44444444-4444-4444-8444-444444444444', role: 'EMPLOYEE' }, secret);
const admin = jwt.sign({ userId: '55555555-5555-4555-8555-555555555555', role: 'ADMIN' }, secret);
const envelope = { meta: { businessDate: '2026-08-01', range: { from: '2026-08-01', to: '2026-08-01', preset: 'month' }, generatedAt: new Date().toISOString(), currency: 'USD' }, data: {} };

describe('dashboard analytics routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const mock of Object.values(service)) mock.mockResolvedValue(envelope);
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/dashboard/overview')).status).toBe(401);
  });

  it('returns the documented envelope and forwards cache bypass', async () => {
    const response = await request(app).get('/api/v1/dashboard/overview?range=month').set('Authorization', `Bearer ${employee}`).set('x-dashboard-refresh', 'true');
    expect(response.status).toBe(200);
    expect(response.body.data.meta.currency).toBe('USD');
    expect(service.overview).toHaveBeenCalledWith(expect.objectContaining({ range: 'month' }), expect.objectContaining({ role: 'EMPLOYEE', bypassCache: true }));
  });

  it('rejects invalid custom ranges', async () => {
    const response = await request(app).get('/api/v1/dashboard/overview?range=custom&from=2026-08-02&to=2026-08-01').set('Authorization', `Bearer ${employee}`);
    expect(response.status).toBe(400);
  });

  it('restricts month-end to admins', async () => {
    expect((await request(app).get('/api/v1/dashboard/month-end?month=2026-08').set('Authorization', `Bearer ${employee}`)).status).toBe(403);
    expect((await request(app).get('/api/v1/dashboard/month-end?month=2026-08').set('Authorization', `Bearer ${admin}`)).status).toBe(200);
  });

  it('keeps recent activity as an alias', async () => {
    const response = await request(app).get('/api/v1/dashboard/recent-activity').set('Authorization', `Bearer ${employee}`);
    expect(response.status).toBe(200);
    expect(service.activity).toHaveBeenCalled();
  });
});
