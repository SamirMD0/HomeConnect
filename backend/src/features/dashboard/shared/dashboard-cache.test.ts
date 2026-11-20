import { describe, expect, it, vi } from 'vitest';
import { DashboardCache } from './dashboard-cache';

describe('DashboardCache', () => {
  it('reuses live entries and supports bypass and expiry', async () => {
    const cache = new DashboardCache();
    const factory = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3);
    expect(await cache.getOrCreate('x', 100, factory, false, 0)).toBe(1);
    expect(await cache.getOrCreate('x', 100, factory, false, 50)).toBe(1);
    expect(await cache.getOrCreate('x', 100, factory, true, 60)).toBe(2);
    expect(await cache.getOrCreate('x', 100, factory, false, 161)).toBe(3);
  });

  it('shares one computation between concurrent requests and retries after a failure', async () => {
    const cache = new DashboardCache();
    let release: (value: number) => void = () => undefined;
    const factory = vi.fn(() => new Promise<number>((resolve) => (release = resolve)));
    const first = cache.getOrCreate('x', 100, factory, false, 0);
    const second = cache.getOrCreate('x', 100, factory, true, 0);
    release(7);
    expect(await Promise.all([first, second])).toEqual([7, 7]);
    expect(factory).toHaveBeenCalledTimes(1);
    const failing = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce(9);
    await expect(cache.getOrCreate('y', 100, failing, false, 0)).rejects.toThrow('db down');
    expect(await cache.getOrCreate('y', 100, failing, false, 0)).toBe(9);
  });
});
