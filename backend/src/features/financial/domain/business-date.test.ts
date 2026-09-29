import { describe, expect, it } from 'vitest';
import {
  addMonthsToBusinessDate,
  businessDateStartInstant,
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

  it('returns the UTC instant of Beirut midnight for a business date in +03:00 (DST)', () => {
    // August is in Beirut Summer Time (+03:00), so local 00:00 = 21:00 UTC of the previous day.
    expect(businessDateStartInstant('2026-08-13', 'Asia/Beirut').toISOString()).toBe('2026-08-12T21:00:00.000Z');
  });

  it('returns the UTC instant of Beirut midnight for a business date in +02:00 (standard time)', () => {
    // January is standard time (+02:00), so local 00:00 = 22:00 UTC of the previous day.
    expect(businessDateStartInstant('2026-01-15', 'Asia/Beirut').toISOString()).toBe('2026-01-14T22:00:00.000Z');
  });

  it('handles the Beirut spring-forward day boundary (DST start)', () => {
    // 2026-03-27 → 2026-03-28: at 00:00 local on the 27th offset is still +02:00.
    // The instant that starts the business day is 2026-03-26T22:00Z (before clocks jump forward).
    expect(businessDateStartInstant('2026-03-27', 'Asia/Beirut').toISOString()).toBe('2026-03-26T22:00:00.000Z');
    // 2026-03-29: DST has already started, so 00:00 local = 21:00 UTC of 2026-03-28.
    expect(businessDateStartInstant('2026-03-29', 'Asia/Beirut').toISOString()).toBe('2026-03-28T21:00:00.000Z');
  });

  it('handles the Beirut fall-back day boundary (DST end)', () => {
    // Beirut ends DST at 24:00 local on 2026-10-24 (so 2026-10-25 begins at 21:00 UTC and
    // the clock immediately falls back to 23:00 local; from the caller's perspective the
    // start of the 25th's wall-clock day is 22:00 UTC on the 24th under +02:00).
    expect(businessDateStartInstant('2026-10-18', 'Asia/Beirut').toISOString()).toBe('2026-10-17T21:00:00.000Z');
    expect(businessDateStartInstant('2026-10-25', 'Asia/Beirut').toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(businessDateStartInstant('2026-10-26', 'Asia/Beirut').toISOString()).toBe('2026-10-25T22:00:00.000Z');
  });

  it('rejects an invalid business date', () => {
    expect(() => businessDateStartInstant('2026-13-01')).toThrow(InvalidBusinessDateError);
  });
});
