import type { BusinessDate } from '../../financial';
import { businessDateToPrisma, parseBusinessDate, todayInBusinessTimezone } from '../../financial';
import { addDays, differenceInDays, resolveMonthRange } from '../../dashboard/shared/dashboard-range';

export type ReportsPeriodPreset = 'thisMonth' | 'lastMonth' | 'custom' | 'thisWeek' | 'today';

export interface ReportsPeriodQuery {
  period?: ReportsPeriodPreset;
  from?: string;
  to?: string;
}

export interface ResolvedReportsPeriod {
  from: BusinessDate;
  to: BusinessDate;
  previousFrom: BusinessDate;
  previousTo: BusinessDate;
  preset: ReportsPeriodPreset;
}

/**
 * Resolves report periods independently of the live dashboard: thisMonth is
 * month-to-date, while lastMonth is a complete, closed calendar month.
 */
export function resolveReportsPeriod(
  query: ReportsPeriodQuery = {},
  businessDate: BusinessDate = todayInBusinessTimezone()
): ResolvedReportsPeriod {
  const current = parseBusinessDate(businessDate);
  const preset = query.period ?? 'thisMonth';
  let from: BusinessDate;
  let to: BusinessDate;

  if (preset === 'custom') {
    if (!query.from || !query.to) throw new Error('Custom report period requires from and to');
    from = parseBusinessDate(query.from);
    to = parseBusinessDate(query.to);
    if (from > to) throw new Error('Custom report period from must not be after to');
  } else if (preset === 'lastMonth') {
    const currentMonth = resolveMonthRange(current.slice(0, 7));
    const lastMonthEnd = addDays(currentMonth.from, -1);
    ({ from, to } = resolveMonthRange(lastMonthEnd.slice(0, 7)));
  } else if (preset === 'thisMonth') {
    from = resolveMonthRange(current.slice(0, 7)).from;
    to = current;
  } else if (preset === 'thisWeek') {
    const weekday = businessDateToPrisma(current).getUTCDay();
    const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
    from = addDays(current, -daysFromMonday);
    to = current;
  } else {
    from = current;
    to = current;
  }

  const dayCount = differenceInDays(from, to) + 1;
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(previousTo, -(dayCount - 1));

  return { from, to, previousFrom, previousTo, preset };
}
