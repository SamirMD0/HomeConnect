import { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticationError, ValidationError } from '../lib/errors';
import { errorHandler, isRoutineAuthFailure } from './error.middleware';

const { logBackendErrorMock } = vi.hoisted(() => ({
  logBackendErrorMock: vi.fn(),
}));

vi.mock('../features/diagnostics/error-logger', () => ({
  logBackendError: logBackendErrorMock,
}));

vi.mock('../lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

function requestFor(path: string): Request {
  return { method: 'GET', path, query: {} } as unknown as Request;
}

function responseSpy(): Response {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
  };
  return res as unknown as Response;
}

describe('isRoutineAuthFailure', () => {
  it.each([
    ['/api/v1/auth/me', true],
    ['/api/v1/auth/refresh', true],
    ['/api/v1/financial-ledger', true],
    ['/api/v1/auth/login', false],
  ])('classifies a 401 on %s as routine=%s', (path, expected) => {
    expect(isRoutineAuthFailure(401, path)).toBe(expected);
  });

  it('never treats non-401 statuses as routine', () => {
    expect(isRoutineAuthFailure(403, '/api/v1/auth/me')).toBe(false);
    expect(isRoutineAuthFailure(500, '/api/v1/auth/me')).toBe(false);
  });
});

describe('errorHandler diagnostics logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not record an unauthenticated /auth/me poll', () => {
    errorHandler(
      new AuthenticationError('Missing or invalid authorization header'),
      requestFor('/api/v1/auth/me'),
      responseSpy(),
      vi.fn() as unknown as NextFunction
    );

    expect(logBackendErrorMock).not.toHaveBeenCalled();
  });

  it('does not record an expired session on a business endpoint', () => {
    errorHandler(
      new AuthenticationError('Invalid or expired token'),
      requestFor('/api/v1/financial-ledger'),
      responseSpy(),
      vi.fn() as unknown as NextFunction
    );

    expect(logBackendErrorMock).not.toHaveBeenCalled();
  });

  it('still records failed login attempts', () => {
    errorHandler(
      new AuthenticationError('Invalid username or password'),
      requestFor('/api/v1/auth/login'),
      responseSpy(),
      vi.fn() as unknown as NextFunction
    );

    expect(logBackendErrorMock).toHaveBeenCalledTimes(1);
    expect(logBackendErrorMock.mock.calls[0][0]).toMatchObject({
      status: 401,
      path: '/api/v1/auth/login',
    });
  });

  it('still records non-auth application errors', () => {
    errorHandler(
      new ValidationError('Validation failed: month: Use YYYY-MM'),
      requestFor('/api/v1/receivables'),
      responseSpy(),
      vi.fn() as unknown as NextFunction
    );

    expect(logBackendErrorMock).toHaveBeenCalledTimes(1);
  });

  it('still records unexpected errors', () => {
    const res = responseSpy();
    errorHandler(
      new Error('boom'),
      requestFor('/api/v1/receivables'),
      res,
      vi.fn() as unknown as NextFunction
    );

    expect(logBackendErrorMock).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
