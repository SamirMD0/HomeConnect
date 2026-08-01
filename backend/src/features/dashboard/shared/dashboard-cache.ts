interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export class DashboardCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  async getOrCreate<T>(
    key: string,
    ttlMs: number,
    factory: () => Promise<T>,
    bypass = false,
    now = Date.now()
  ): Promise<T> {
    const entry = this.entries.get(key) as CacheEntry<T> | undefined;
    if (!bypass && entry && entry.expiresAt > now) return entry.value;
    const value = await factory();
    this.entries.set(key, { value, expiresAt: now + ttlMs });
    return value;
  }

  clear(prefix?: string): void {
    if (!prefix) {
      this.entries.clear();
      return;
    }
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
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

