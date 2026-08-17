import { describe, expect, it } from 'vitest';
import { resolveReportsPeriod } from './reports-period';

describe('resolveReportsPeriod', () => {
  it('defaults to an explicitly identifiable month-to-date period', () => {
    expect(resolveReportsPeriod({}, '2026-08-17')).toEqual({
      from: '2026-08-01',
      to: '2026-08-17',
      previousFrom: '2026-07-15',
      previousTo: '2026-07-31',
      preset: 'thisMonth',
    });
  });

  it('resolves lastMonth as the full closed calendar month across a year boundary', () => {
    expect(resolveReportsPeriod({ period: 'lastMonth' }, '2026-01-12')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
      previousFrom: '2025-10-31',
      previousTo: '2025-11-30',
      preset: 'lastMonth',
    });
  });

  it('honours leap February without local-time date construction', () => {
    expect(resolveReportsPeriod({ period: 'lastMonth' }, '2028-03-31')).toMatchObject({
      from: '2028-02-01',
      to: '2028-02-29',
      previousFrom: '2028-01-03',
      previousTo: '2028-01-31',
    });
  });

  it('uses an equal-length immediately preceding window for a custom range', () => {
    expect(resolveReportsPeriod({ period: 'custom', from: '2026-07-10', to: '2026-07-20' }, '2026-08-17'))
      .toEqual({
        from: '2026-07-10',
        to: '2026-07-20',
        previousFrom: '2026-06-29',
        previousTo: '2026-07-09',
        preset: 'custom',
      });
  });

  it('resolves thisWeek from Monday through the business date', () => {
    expect(resolveReportsPeriod({ period: 'thisWeek' }, '2026-08-16')).toEqual({
      from: '2026-08-10',
      to: '2026-08-16',
      previousFrom: '2026-08-03',
      previousTo: '2026-08-09',
      preset: 'thisWeek',
    });
  });

  it('resolves today and its one-day comparison period', () => {
    expect(resolveReportsPeriod({ period: 'today' }, '2026-08-17')).toEqual({
      from: '2026-08-17',
      to: '2026-08-17',
      previousFrom: '2026-08-16',
      previousTo: '2026-08-16',
      preset: 'today',
    });
  });

  it('rejects missing, invalid, and reversed custom boundaries', () => {
    expect(() => resolveReportsPeriod({ period: 'custom', from: '2026-07-01' }, '2026-08-17'))
      .toThrow('requires from and to');
    expect(() => resolveReportsPeriod({ period: 'custom', from: '2026-02-30', to: '2026-03-01' }, '2026-08-17'))
      .toThrow();
    expect(() => resolveReportsPeriod({ period: 'custom', from: '2026-07-20', to: '2026-07-10' }, '2026-08-17'))
      .toThrow('from must not be after to');
  });
});
