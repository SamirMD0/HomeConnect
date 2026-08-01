import {
  BusinessDate,
  daysInMonth,
  parseBusinessDate,
  splitBusinessDate,
  todayInBusinessTimezone,
} from '../../financial';
import type {
  DashboardGranularity,
  DashboardMeta,
  DashboardQuery,
  DashboardRangePreset,
  ResolvedDashboardRange,
} from '../dashboard.types';

export function resolveDashboardRange(
  query: Partial<DashboardQuery> = {},
  businessDate: BusinessDate = todayInBusinessTimezone()
): ResolvedDashboardRange {
  const preset = query.range ?? 'month';
  const current = parseBusinessDate(businessDate);
  let from: BusinessDate;
  let to: BusinessDate;

  if (preset === 'custom') {
    if (!query.from || !query.to) throw new Error('Custom range requires from and to');
    from = parseBusinessDate(query.from);
    to = parseBusinessDate(query.to);
    if (from > to) throw new Error('Custom range from must not be after to');
  } else {
    ({ from, to } = presetBounds(preset, current));
  }

  const dayCount = differenceInDays(from, to) + 1;
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(previousTo, -(dayCount - 1));

  return {
    preset,
    from,
    to,
    previousFrom,
    previousTo,
    granularity: query.granularity ?? inferGranularity(dayCount),
  };
}

export function createDashboardMeta(
  range: ResolvedDashboardRange,
  businessDate: BusinessDate = todayInBusinessTimezone(),
  generatedAt = new Date()
): DashboardMeta {
  return {
    businessDate,
    range: { from: range.from, to: range.to, preset: range.preset },
    generatedAt: generatedAt.toISOString(),
    currency: 'USD',
  };
}

export function resolveMonthRange(month: string): { from: BusinessDate; to: BusinessDate } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error('Month must use YYYY-MM format');
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) throw new Error('Month must be valid');
  return {
    from: parseBusinessDate(`${match[1]}-${match[2]}-01`),
    to: parseBusinessDate(
      `${match[1]}-${match[2]}-${String(daysInMonth(year, monthNumber)).padStart(2, '0')}`
    ),
  };
}

export function addDays(value: BusinessDate, days: number): BusinessDate {
  const { year, month, day } = splitBusinessDate(value);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return parseBusinessDate(date.toISOString().slice(0, 10));
}

export function differenceInDays(from: BusinessDate, to: BusinessDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function presetBounds(
  preset: Exclude<DashboardRangePreset, 'custom'>,
  businessDate: BusinessDate
): { from: BusinessDate; to: BusinessDate } {
  const { year, month } = splitBusinessDate(businessDate);
  if (preset === 'today') return { from: businessDate, to: businessDate };
  if (preset === 'week') {
    const weekday = new Date(`${businessDate}T00:00:00Z`).getUTCDay();
    const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
    return { from: addDays(businessDate, -daysFromMonday), to: businessDate };
  }
  if (preset === 'month') {
    return { from: parseBusinessDate(`${year}-${pad(month)}-01`), to: businessDate };
  }
  if (preset === 'quarter') {
    const quarterStart = Math.floor((month - 1) / 3) * 3 + 1;
    return { from: parseBusinessDate(`${year}-${pad(quarterStart)}-01`), to: businessDate };
  }
  return { from: parseBusinessDate(`${year}-01-01`), to: businessDate };
}

function inferGranularity(dayCount: number): DashboardGranularity {
  if (dayCount <= 45) return 'day';
  if (dayCount <= 180) return 'week';
  return 'month';
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

