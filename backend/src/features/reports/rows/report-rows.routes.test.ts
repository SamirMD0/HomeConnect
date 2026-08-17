import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { service } = vi.hoisted(() => ({ service: { get: vi.fn(), exportCsv: vi.fn() } }));
vi.mock('./report-rows.service', () => ({ ReportRowsService: service }));
vi.mock('../../../lib/prisma', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) }, transactionModel: {}, activityLogModel: {} }));

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);
const paths = [
  'customers/new', 'customers/debts', 'customers/payments', 'suppliers/debts',
  'suppliers/receiving', 'sales/orders', 'sales/unpaid', 'inventory/movements',
  'inventory/reconciliation',
];

describe('report row routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.get.mockResolvedValue({ meta: { from: '2026-08-01', to: '2026-08-17' }, data: { summary: {}, rows: [] } });
    service.exportCsv.mockResolvedValue({ filename: 'report.csv', csv: '\uFEFFa\r\n' });
  });

  it.each(paths)('keeps %s ADMIN-only', async (path) => {
    expect((await request(app).get(`/api/v1/reports/${path}`)).status).toBe(401);
    expect((await request(app).get(`/api/v1/reports/${path}`).set('Authorization', `Bearer ${employee}`)).status).toBe(403);
  });

  it.each(paths)('serves %s with the validated period envelope', async (path) => {
    const response = await request(app).get(`/api/v1/reports/${path}?period=lastMonth`).set('Authorization', `Bearer ${admin}`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('returns shared CSV headers and validates custom ranges', async () => {
    const csv = await request(app).get('/api/v1/reports/inventory/movements/export.csv?period=lastMonth').set('Authorization', `Bearer ${admin}`);
    const invalid = await request(app).get('/api/v1/reports/customers/new?period=custom&from=2026-08-01').set('Authorization', `Bearer ${admin}`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('report.csv');
    expect(invalid.status).toBe(400);
  });
});
