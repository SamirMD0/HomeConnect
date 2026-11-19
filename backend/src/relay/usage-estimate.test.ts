import { describe, expect, it } from 'vitest';
import { awakeMinutes, estimateUsage } from './usage-estimate';

describe('Neon usage estimate from active minutes', () => {
  it('counts each active minute as 6 awake minutes (the minute + 5-minute suspend delay)', () => {
    expect(awakeMinutes([])).toBe(0);
    expect(awakeMinutes([0])).toBe(6);
    expect(awakeMinutes([10, 40])).toBe(12);
  });

  it('merges overlapping minutes instead of double counting', () => {
    // Requests at minutes 0, 1 and 2 keep Neon awake from 0 to 8.
    expect(awakeMinutes([0, 1, 2])).toBe(8);
    // Requests 5 minutes apart chain through the suspend delay.
    expect(awakeMinutes([0, 5])).toBe(11);
    expect(awakeMinutes([3, 3, 3])).toBe(6);
  });

  it('never counts past midnight and ignores invalid minutes', () => {
    expect(awakeMinutes([1439])).toBe(1);
    expect(awakeMinutes([-1, 1440, 1.5])).toBe(0);
  });

  it('turns awake time into CU-hours at the fixed 0.25 CU and projects the month', () => {
    // A worker every 15 minutes for 15 opening hours: 60 short wakes of 6 minutes a day.
    const day = (date: number) => ({ day: new Date(Date.UTC(2026, 10, date)), activeSlots: Array.from({ length: 60 }, (_, i) => 420 + i * 15) });
    const estimate = estimateUsage([day(1), day(2), day(3)], new Date(Date.UTC(2026, 10, 4, 0, 0)));
    // 360 minutes = 6 h × 0.25 = 1.5 CU-h a day; 3 days = 4.5; 30-day month → 45.
    expect(estimate.monthToDateCuHours).toBe(4.5);
    expect(estimate.projectedMonthCuHours).toBe(45);
    expect(estimate.freeCuHours).toBe(100);
    expect(estimate.warn).toBe(false);
  });

  it('warns from 80 % of the free plan, and ignores other months', () => {
    const busy = (date: number) => ({ day: new Date(Date.UTC(2026, 10, date)), activeSlots: Array.from({ length: 1440 }, (_, i) => i) });
    const lastMonth = { day: new Date(Date.UTC(2026, 9, 31)), activeSlots: Array.from({ length: 1440 }, (_, i) => i) };
    const estimate = estimateUsage([busy(1), lastMonth], new Date(Date.UTC(2026, 10, 2)));
    expect(estimate.monthToDateCuHours).toBe(6);
    expect(estimate.warn).toBe(true);
  });

  it('does not project wildly in the first minutes of a month', () => {
    const estimate = estimateUsage([{ day: new Date(Date.UTC(2026, 10, 1)), activeSlots: [0] }], new Date(Date.UTC(2026, 10, 1, 0, 1)));
    expect(estimate.projectedMonthCuHours).toBeLessThanOrEqual(24 * 30 * 0.25);
  });
});
