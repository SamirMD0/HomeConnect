import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    customer: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    activityLog: {
      findMany: vi.fn(),
    },
    transaction: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
  },
  transactionModel: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  activityLogModel: {
    findMany: vi.fn(),
  },
}));

import { app } from './app';
import { prisma } from './lib/prisma';

describe('Express app smoke tests', () => {
  it('returns health status when the database responds', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({
      status: 'healthy',
      database: 'connected',
    });
  });

  it('allows credentialed CORS preflight from the documented frontend origin', async () => {
    const response = await request(app)
      .options('/api/v1/auth/me')
      .set('Origin', 'http://localhost:3002')
      .set('Access-Control-Request-Method', 'GET');

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3002');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('allows credentialed CORS preflight from the Electron runtime origin', async () => {
    const response = await request(app)
      .options('/api/v1/auth/me')
      .set('Origin', 'http://127.0.0.1:3002')
      .set('Access-Control-Request-Method', 'GET');

    expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:3002');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('returns a safe database failure message when health cannot reach PostgreSQL', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('password=secret DATABASE_URL'));

    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toEqual({
      code: 'DATABASE_UNAVAILABLE',
      message: 'Database connection failed. Confirm local PostgreSQL is running.',
    });
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });

  it('returns 401 for auth/me without a token', async () => {
    const response = await request(app).get('/api/v1/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns a quiet 401 for auth refresh without a refresh cookie', async () => {
    const response = await request(app).post('/api/v1/auth/refresh');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Session expired. Please log in again.',
    });
  });
});
