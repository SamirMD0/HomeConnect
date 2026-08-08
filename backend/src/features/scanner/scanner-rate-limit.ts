import { NextFunction, Request, Response } from 'express';
import { RateLimitError } from '../../lib/errors';

/**
 * Sliding-window limiter, in memory, no dependency.
 *
 * Modelled on the attempt tracking in lib/admin-verification: a plain array of
 * timestamps per key, pruned on each call. That is more than adequate for a
 * single-process backend serving one shop, and it keeps the scanner feature from
 * adding a package for the sake of two routes.
 *
 * Keyed by IP. Once the LAN listener exists this is the first thing a device on
 * the shop Wi-Fi meets, so it deliberately counts *attempts*, not successes.
 */
interface Hit {
  key: string;
  at: number;
}

export interface RateLimitOptions {
  /** Maximum requests allowed inside the window. */
  limit: number;
  windowMs: number;
  /** Distinguishes buckets so two routes never share a budget. */
  name: string;
}

const buckets = new Map<string, Hit[]>();

const keyFor = (req: Request) => req.ip ?? 'unknown';

export function rateLimit({ limit, windowMs, name }: RateLimitOptions) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = keyFor(req);
    const hits = (buckets.get(name) ?? []).filter((hit) => now - hit.at <= windowMs);

    const forKey = hits.filter((hit) => hit.key === key).length;
    if (forKey >= limit) {
      // The rejected attempt is not recorded, so a caller hammering a limited
      // route cannot extend its own lockout indefinitely.
      buckets.set(name, hits);
      return next(new RateLimitError());
    }

    hits.push({ key, at: now });
    buckets.set(name, hits);
    next();
  };
}

/** Test seam; also used when the LAN listener is disabled in later work. */
export function resetRateLimits(): void {
  buckets.clear();
}
