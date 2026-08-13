import { describe, expect, it } from 'vitest';
import {
  addMonthsToBusinessDate,
  businessDateToPrisma,
  compareBusinessDates,
  isBusinessDatePast,
  parseBusinessDate,
  prismaDateToBusinessDate,
  timestampToBusinessDate,
  todayInBusinessTimezone,
} from './business-date';
import { InvalidBusinessDateError } from './financial-errors';

describe('business date helpers', () => {
  it('validates strict date-only strings', () => {
    expect(parseBusinessDate('2026-07-24')).toBe('2026-07-24');
    expect(() => parseBusinessDate('2026-7-24')).toThrow(InvalidBusinessDateError);
    expect(() => parseBusinessDate('2026-02-30')).toThrow(InvalidBusinessDateError);
  });

  it('handles leap years and February boundaries', () => {
    expect(parseBusinessDate('2028-02-29')).toBe('2028-02-29');
    expect(() => parseBusinessDate('2027-02-29')).toThrow(InvalidBusinessDateError);
  });

  it('round-trips Prisma DATE transport values without shifting the day', () => {
    const prismaDate = businessDateToPrisma('2026-02-28');
    expect(prismaDate.toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(prismaDateToBusinessDate(prismaDate)).toBe('2026-02-28');
  });

  it('compares due dates against a business date', () => {
    expect(compareBusinessDates('2026-07-23', '2026-07-24')).toBe(-1);
    expect(compareBusinessDates('2026-07-24', '2026-07-24')).toBe(0);
    expect(isBusinessDatePast('2026-07-23', '2026-07-24')).toBe(true);
  });

  it('adds months with year rollover and independent month-end anchoring', () => {
    expect(addMonthsToBusinessDate('2026-08-01', 5)).toBe('2027-01-01');
    expect(addMonthsToBusinessDate('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsToBusinessDate('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonthsToBusinessDate('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('derives today in the Beirut business timezone at UTC boundaries', () => {
    const utcBoundary = new Date('2026-07-23T21:30:00.000Z');
    expect(todayInBusinessTimezone('Asia/Beirut', utcBoundary)).toBe('2026-07-24');
  });

  it('converts an instant across Beirut midnight instead of reading its UTC date fields', () => {
    const afterBeirutMidnight = new Date('2026-08-12T21:30:00.000Z');

    expect(prismaDateToBusinessDate(afterBeirutMidnight)).toBe('2026-08-12');
    expect(timestampToBusinessDate('Asia/Beirut', afterBeirutMidnight)).toBe('2026-08-13');
  });

  it('converts a regular midday instant to the expected Beirut business date', () => {
    const middayInBeirut = new Date('2026-08-13T09:00:00.000Z');
    expect(timestampToBusinessDate('Asia/Beirut', middayInBeirut)).toBe('2026-08-13');
  });
});
