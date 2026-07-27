import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { correctionsServiceMock } = vi.hoisted(() => ({
  correctionsServiceMock: {
    listCorrections: vi.fn(),
  },
}));

vi.mock('./corrections.service', () => ({
  CorrectionsService: correctionsServiceMock,
}));

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
  },
  transactionModel: {},
  activityLogModel: {},
}));

const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const adminToken = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, jwtSecret);
const employeeToken = jwt.sign({ userId: '44444444-4444-4444-8444-444444444444', role: 'EMPLOYEE' }, jwtSecret);
const customerId = '22222222-2222-4222-8222-222222222222';
const recordId = '33333333-3333-4333-8333-333333333333';

describe('corrections routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    correctionsServiceMock.listCorrections.mockResolvedValue([
      {
        id: 'audit-1',
        recordType: 'DEBT',
        recordId,
        customerId,
        action: 'CORRECT_DETAILS',
        correctedBy: { id: 'admin-1', name: 'Admin User', username: 'admin' },
        correctedAt: '2026-07-27T10:00:00.000Z',
        reason: 'Correct typo',
        beforeValues: { description: 'Old' },
        afterValues: { description: 'New' },
        affectedTotals: null,
        sourceScreen: 'LEDGER',
        requestId: null,
        ipAddress: null,
      },
    ]);
  });

  it('requires admin access for correction audit reads', async () => {
    const unauthenticated = await request(app).get('/api/v1/corrections');
    const employee = await request(app)
      .get('/api/v1/corrections')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(unauthenticated.status).toBe(401);
    expect(employee.status).toBe(403);
    expect(correctionsServiceMock.listCorrections).not.toHaveBeenCalled();
  });

  it('lists correction audits with record filters', async () => {
    const response = await request(app)
      .get(`/api/v1/corrections?recordType=DEBT&recordId=${recordId}&from=2026-07-01&to=2026-07-31`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(correctionsServiceMock.listCorrections).toHaveBeenCalledWith({
      recordType: 'DEBT',
      recordId,
      from: '2026-07-01',
      to: '2026-07-31',
    });
  });

  it('lists customer correction audits through the customer route', async () => {
    const response = await request(app)
      .get(`/api/v1/customers/${customerId}/corrections?recordType=DEBT`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(correctionsServiceMock.listCorrections).toHaveBeenCalledWith({
      recordType: 'DEBT',
      customerId,
    });
  });
});
