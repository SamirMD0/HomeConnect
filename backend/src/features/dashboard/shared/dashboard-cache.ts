interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export class DashboardCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  /** Requests for the same figures while they are being computed share one computation. */
  private readonly pending = new Map<string, Promise<unknown>>();

  async getOrCreate<T>(
    key: string,
    ttlMs: number,
    factory: () => Promise<T>,
    bypass = false,
    now = Date.now()
  ): Promise<T> {
    const entry = this.entries.get(key) as CacheEntry<T> | undefined;
    if (!bypass && entry && entry.expiresAt > now) return entry.value;
    // A computation already running started after any refresh asked for, so it is fresh enough.
    const running = this.pending.get(key) as Promise<T> | undefined;
    if (running) return running;
    const computing = factory().then((value) => {
      this.entries.set(key, { value, expiresAt: now + ttlMs });
      return value;
    });
    this.pending.set(key, computing);
    try {
      return await computing;
    } finally {
      if (this.pending.get(key) === computing) this.pending.delete(key);
    }
  }

  clear(prefix?: string): void {
    if (!prefix) {
      this.entries.clear();
      this.pending.clear();
      return;
    }
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
    for (const key of this.pending.keys()) {
      if (key.startsWith(prefix)) this.pending.delete(key);
    }
  }
}

export const dashboardCache = new DashboardCache();

export function dashboardCacheKey(
  endpoint: string,
  range: ResolvedDashboardRange,
  includeArchived: boolean,
  suffix = ''
): string {
  return [endpoint, range.from, range.to, range.granularity, includeArchived, suffix].join(':');
}

import type { ResolvedDashboardRange } from '../dashboard.types';
