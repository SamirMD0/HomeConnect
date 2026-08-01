import { describe, expect, it } from 'vitest';
import { dashboardQuerySchema } from '../dashboard.validator';
import { resolveDashboardRange, resolveMonthRange } from './dashboard-range';

describe('dashboard range resolver', () => {
  it.each([
    ['today', '2026-08-01', '2026-08-01'],
    ['week', '2026-07-27', '2026-08-01'],
    ['month', '2026-08-01', '2026-08-01'],
    ['quarter', '2026-07-01', '2026-08-01'],
    ['year', '2026-01-01', '2026-08-01'],
  ] as const)('resolves %s consistently', (range, from, to) => {
    expect(resolveDashboardRange({ range }, '2026-08-01')).toMatchObject({ from, to, preset: range });
  });

  it('defaults to the current month', () => {
    expect(resolveDashboardRange({}, '2026-08-19')).toMatchObject({
      from: '2026-08-01',
      to: '2026-08-19',
      preset: 'month',
    });
  });

  it('rejects a reversed custom range', () => {
    expect(() =>
      dashboardQuerySchema.parse({ range: 'custom', from: '2026-08-02', to: '2026-08-01' })
    ).toThrow(/from must not be after to/);
  });

  it('resolves month boundaries including leap years', () => {
    expect(resolveMonthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});

