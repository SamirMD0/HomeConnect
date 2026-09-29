import express, { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { Role } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import {
  clearUserSessionStatusCache,
  USER_SESSION_STATUS_CACHE_TTL_MS,
} from '../lib/user-session-status';
import { requireAuth } from './auth.middleware';

vi.unmock('../lib/user-session-status');

vi.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

const userId = '11111111-1111-4111-8111-111111111111';
const token = jwt.sign(
  { userId, role: Role.EMPLOYEE },
  process.env.JWT_SECRET as string,
  { expiresIn: '1h' },
);

function createProtectedApp() {
  const app = express();
  app.get('/protected', requireAuth, (req, res) => {
    res.status(200).json({ user: req.user });
  });
  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({ message: error.message });
  });
  return app;
}

describe('requireAuth user status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearUserSessionStatusCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows an active user', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      role: Role.ADMIN,
      isActive: true,
      deletedAt: null,
    } as never);

    const response = await request(createProtectedApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ userId, role: Role.EMPLOYEE });
  });

  it('rejects a deactivated user with a valid token', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      role: Role.EMPLOYEE,
      isActive: false,
      deletedAt: null,
    } as never);

    const response = await request(createProtectedApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid token or account deactivated');
  });

  it('rejects a deleted user with a valid token', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      role: Role.EMPLOYEE,
      isActive: false,
      deletedAt: new Date(),
    } as never);

    const response = await request(createProtectedApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid token or account deactivated');
  });

  it('re-checks the database after the cache TTL expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T12:00:00.000Z'));
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({
        role: Role.EMPLOYEE,
        isActive: true,
        deletedAt: null,
      } as never)
      .mockResolvedValueOnce({
        role: Role.EMPLOYEE,
        isActive: false,
        deletedAt: null,
      } as never);

    const app = createProtectedApp();
    const firstResponse = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    const cachedResponse = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(firstResponse.status).toBe(200);
    expect(cachedResponse.status).toBe(200);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(USER_SESSION_STATUS_CACHE_TTL_MS + 1);

    const expiredResponse = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(expiredResponse.status).toBe(401);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });
});
