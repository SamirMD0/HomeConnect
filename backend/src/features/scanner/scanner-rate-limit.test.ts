import { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimitError } from '../../lib/errors';
import { rateLimit, resetRateLimits } from './scanner-rate-limit';

const call = (middleware: ReturnType<typeof rateLimit>, ip = '192.168.1.50') => {
  const next = vi.fn();
  middleware({ ip } as Request, {} as Response, next as unknown as NextFunction);
  return next.mock.calls[0][0];
};

beforeEach(() => {
  resetRateLimits();
  vi.useRealTimers();
});

describe('rateLimit', () => {
  it('allows requests up to the limit and rejects the next one', () => {
    const limiter = rateLimit({ name: 'test:basic', limit: 3, windowMs: 60_000 });
    expect(call(limiter)).toBeUndefined();
    expect(call(limiter)).toBeUndefined();
    expect(call(limiter)).toBeUndefined();
    expect(call(limiter)).toBeInstanceOf(RateLimitError);
  });

  it('rejects with a 429', () => {
    const limiter = rateLimit({ name: 'test:status', limit: 1, windowMs: 60_000 });
    call(limiter);
    const error = call(limiter) as RateLimitError;
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe('RATE_LIMITED');
  });

  it('budgets each address separately', () => {
    const limiter = rateLimit({ name: 'test:per-ip', limit: 1, windowMs: 60_000 });
    expect(call(limiter, '192.168.1.10')).toBeUndefined();
    expect(call(limiter, '192.168.1.10')).toBeInstanceOf(RateLimitError);
    expect(call(limiter, '192.168.1.11')).toBeUndefined();
  });

  it('budgets each route separately', () => {
    const first = rateLimit({ name: 'test:route-a', limit: 1, windowMs: 60_000 });
    const second = rateLimit({ name: 'test:route-b', limit: 1, windowMs: 60_000 });
    call(first);
    expect(call(first)).toBeInstanceOf(RateLimitError);
    expect(call(second)).toBeUndefined();
  });

  it('frees the budget once the window slides past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T10:00:00.000Z'));
    const limiter = rateLimit({ name: 'test:window', limit: 1, windowMs: 60_000 });
    expect(call(limiter)).toBeUndefined();
    expect(call(limiter)).toBeInstanceOf(RateLimitError);

    vi.setSystemTime(new Date('2026-08-07T10:01:01.000Z'));
    expect(call(limiter)).toBeUndefined();
    vi.useRealTimers();
  });

  /**
   * A caller that keeps hammering a limited route must not be able to keep
   * pushing its own window forward, or a burst would extend into a lockout far
   * longer than the configured one.
   */
  it('does not count rejected attempts against the window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T10:00:00.000Z'));
    const limiter = rateLimit({ name: 'test:no-extend', limit: 1, windowMs: 60_000 });
    call(limiter);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      vi.setSystemTime(new Date(`2026-08-07T10:00:${String(attempt + 10).padStart(2, '0')}.000Z`));
      expect(call(limiter)).toBeInstanceOf(RateLimitError);
    }
    vi.setSystemTime(new Date('2026-08-07T10:01:01.000Z'));
    expect(call(limiter)).toBeUndefined();
    vi.useRealTimers();
  });

  it('treats an unknown address as a single bucket rather than crashing', () => {
    const limiter = rateLimit({ name: 'test:no-ip', limit: 1, windowMs: 60_000 });
    const next = vi.fn();
    limiter({} as Request, {} as Response, next as unknown as NextFunction);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });
});
