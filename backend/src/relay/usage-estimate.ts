/**
 * Estimated Neon compute use, from the relay's own request times.
 *
 * Neon bills compute in CU-hours (size × awake time) and the Free plan allows
 * 100 a month. The relay can't read Neon's meter, so it records which minutes
 * of each UTC day had a database request. A request keeps Neon awake for its
 * minute plus the 5-minute suspend delay, so each active minute counts as 6
 * awake minutes; overlaps are merged. With the
 * compute fixed at 0.25 CU (see docs/setup/CLOUD_RELAY_SETUP.md), awake hours
 * × 0.25 = CU-hours. This is an estimate: Neon's dashboard is the real figure.
 */
export const SLOT_MINUTES = 1;
export const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES;
export const SUSPEND_MINUTES = 5;
export const COMPUTE_CU = 0.25;
export const FREE_CU_HOURS = 100;
export const WARN_RATIO = 0.8;

/** Minutes the database was awake on one day, from its active minutes. */
export function awakeMinutes(slots: number[]): number {
  const sorted = [...new Set(slots.filter((slot) => Number.isInteger(slot) && slot >= 0 && slot < SLOTS_PER_DAY))].sort(
    (a, b) => a - b
  );
  let total = 0;
  let currentEnd = -1;
  for (const slot of sorted) {
    const start = slot * SLOT_MINUTES;
    const end = Math.min(start + SLOT_MINUTES + SUSPEND_MINUTES, 24 * 60);
    if (start >= currentEnd) total += end - start;
    else if (end > currentEnd) total += end - currentEnd;
    currentEnd = Math.max(currentEnd, end);
  }
  return total;
}

export interface UsageDay {
  day: Date;
  activeSlots: number[];
}
export interface UsageEstimate {
  monthToDateCuHours: number;
  projectedMonthCuHours: number;
  freeCuHours: number;
  warn: boolean;
}

/** Month to date (UTC) and a straight-line projection to the end of the month. */
export function estimateUsage(days: UsageDay[], now: Date): UsageEstimate {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const thisMonth = days.filter((item) => item.day.getUTCFullYear() === year && item.day.getUTCMonth() === month);
  const minutes = thisMonth.reduce((sum, item) => sum + awakeMinutes(item.activeSlots), 0);
  const monthToDate = (minutes / 60) * COMPUTE_CU;
  const monthStart = Date.UTC(year, month, 1);
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  // At least one hour elapsed, so the first minutes of a month don't project wildly.
  const elapsedDays = Math.max((now.getTime() - monthStart) / 86_400_000, 1 / 24);
  const projected = Math.min(monthToDate * (daysInMonth / elapsedDays), 24 * daysInMonth * COMPUTE_CU);
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    monthToDateCuHours: round(monthToDate),
    projectedMonthCuHours: round(projected),
    freeCuHours: FREE_CU_HOURS,
    warn: projected >= FREE_CU_HOURS * WARN_RATIO,
  };
}
