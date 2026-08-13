import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { service } = vi.hoisted(() => ({ service: { create: vi.fn(), list: vi.fn(), get: vi.fn(), update: vi.fn(), changeStatus: vi.fn(), cancel: vi.fn(), reopen: vi.fn(), audit: vi.fn(), summary: vi.fn() } }));
vi.mock('./service-jobs.service', () => ({ ServiceJobsService: service }));
vi.mock('../../../lib/prisma', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) }, transactionModel: {}, activityLogModel: {} }));

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);
const jobId = '33333333-3333-4333-8333-333333333333';
const job = { id: jobId, jobNumber: 'SV-2026-0001', status: 'RECEIVED' };

describe('service job routes', () => {
  beforeEach(() => { vi.clearAllMocks(); service.create.mockResolvedValue(job); service.list.mockResolvedValue({ items: [job], total: 1, page: 1, pageSize: 25 }); service.summary.mockResolvedValue({ open: 1 }); service.cancel.mockResolvedValue({ ...job, status: 'CANCELLED' }); });
  it('allows authenticated staff to create and list jobs', async () => {
    const body = { customerId: '44444444-4444-4444-8444-444444444444', manualProductName: 'مروحة', requestType: 'WORKSHOP_DROP_OFF', issueDescription: 'Does not start', serviceCreatedDate: '2026-07-29' };
    expect((await request(app).post('/api/v1/service-jobs').send(body)).status).toBe(401);
    expect((await request(app).post('/api/v1/service-jobs').set('Authorization', `Bearer ${employee}`).send(body)).status).toBe(201);
    expect((await request(app).get('/api/v1/service-jobs').set('Authorization', `Bearer ${employee}`)).status).toBe(200);
  });
  it('keeps summary before id routing and protects cancellation', async () => {
    expect((await request(app).get('/api/v1/service-jobs/summary').set('Authorization', `Bearer ${employee}`)).status).toBe(200);
    expect((await request(app).post(`/api/v1/service-jobs/${jobId}/cancel`).set('Authorization', `Bearer ${employee}`).send({ reason: 'Customer cancelled job', accountPassword: 'pass' })).status).toBe(403);
    expect((await request(app).post(`/api/v1/service-jobs/${jobId}/cancel`).set('Authorization', `Bearer ${admin}`).send({ reason: 'Customer cancelled job', accountPassword: 'pass' })).status).toBe(200);
    expect((await request(app).delete(`/api/v1/service-jobs/${jobId}`).set('Authorization', `Bearer ${admin}`)).status).toBe(404);
  });

  it('takes normal updates and status changes without a reason or password', async () => {
    service.update.mockResolvedValue(job);
    service.changeStatus.mockResolvedValue(job);
    expect((await request(app).patch(`/api/v1/service-jobs/${jobId}`).set('Authorization', `Bearer ${employee}`).send({ notes: 'Left at counter' })).status).toBe(200);
    expect((await request(app).post(`/api/v1/service-jobs/${jobId}/status`).set('Authorization', `Bearer ${employee}`).send({ status: 'INSPECTION_PENDING' })).status).toBe(200);
  });

  it('rejects a reason or password sent to the relaxed service routes', async () => {
    service.update.mockResolvedValue(job);
    service.changeStatus.mockResolvedValue(job);
    expect((await request(app).patch(`/api/v1/service-jobs/${jobId}`).set('Authorization', `Bearer ${admin}`).send({ notes: 'x', reason: 'Because of this' })).status).toBe(400);
    expect((await request(app).patch(`/api/v1/service-jobs/${jobId}`).set('Authorization', `Bearer ${admin}`).send({ notes: 'x', accountPassword: 'pass' })).status).toBe(400);
    expect((await request(app).post(`/api/v1/service-jobs/${jobId}/status`).set('Authorization', `Bearer ${admin}`).send({ status: 'INSPECTION_PENDING', accountPassword: 'pass' })).status).toBe(400);
  });

  it('still requires a reason and password to cancel or reopen', async () => {
    expect((await request(app).post(`/api/v1/service-jobs/${jobId}/cancel`).set('Authorization', `Bearer ${admin}`).send({ reason: 'Customer cancelled job' })).status).toBe(400);
    expect((await request(app).post(`/api/v1/service-jobs/${jobId}/reopen`).set('Authorization', `Bearer ${admin}`).send({ status: 'RECEIVED', reason: 'Reopened by request' })).status).toBe(400);
  });
});
