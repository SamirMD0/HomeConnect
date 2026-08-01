import { describe, expect, it, vi } from 'vitest';
import { DashboardCache } from './dashboard-cache';

describe('DashboardCache', () => {
  it('reuses live entries and supports bypass and expiry', async () => {
    const cache = new DashboardCache();
    const factory = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    expect(await cache.getOrCreate('x', 100, factory, false, 0)).toBe(1);
    expect(await cache.getOrCreate('x', 100, factory, false, 50)).toBe(1);
    expect(await cache.getOrCreate('x', 100, factory, true, 60)).toBe(2);
    expect(await cache.getOrCreate('x', 100, factory, false, 161)).toBe(3);
  });
});
