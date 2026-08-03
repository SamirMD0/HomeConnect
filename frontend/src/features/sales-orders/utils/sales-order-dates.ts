export type SalesDateMode = 'day' | 'month' | 'all';

export interface SalesDateRange {
  mode: SalesDateMode;
  /** Anchor day for `day` mode, or any day inside the month for `month` mode. */
  anchor: string;
  dateFrom?: string;
  dateTo?: string;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Today as a business date string, using the machine's local calendar day. */
export function todayString(): string {
  const now = new Date();
  return toDayString(now.getFullYear(), now.getMonth(), now.getDate());
}

function toDayString(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDay(value: string): { year: number; monthIndex: number; day: number } | null {
  if (!DAY_PATTERN.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, monthIndex: month - 1, day };
}

/** Shifts a day string by whole days without ever touching UTC, so a DST day is still one step. */
export function shiftDays(value: string, delta: number): string {
  const parsed = parseDay(value) ?? parseDay(todayString())!;
  const date = new Date(parsed.year, parsed.monthIndex, parsed.day + delta);
  return toDayString(date.getFullYear(), date.getMonth(), date.getDate());
}

export function shiftMonths(value: string, delta: number): string {
  const parsed = parseDay(value) ?? parseDay(todayString())!;
  const date = new Date(parsed.year, parsed.monthIndex + delta, 1);
  return toDayString(date.getFullYear(), date.getMonth(), 1);
}

export function monthBounds(value: string): { dateFrom: string; dateTo: string } {
  const parsed = parseDay(value) ?? parseDay(todayString())!;
  const last = new Date(parsed.year, parsed.monthIndex + 1, 0).getDate();
  return {
    dateFrom: toDayString(parsed.year, parsed.monthIndex, 1),
    dateTo: toDayString(parsed.year, parsed.monthIndex, last),
  };
}

/** Builds the range the list and the summary both use, so they can never disagree. */
export function resolveRange(mode: SalesDateMode, anchor: string): SalesDateRange {
  if (mode === 'all') return { mode, anchor };
  if (mode === 'month') return { mode, anchor, ...monthBounds(anchor) };
  return { mode, anchor, dateFrom: anchor, dateTo: anchor };
}

export function stepRange(range: SalesDateRange, direction: -1 | 1): string {
  return range.mode === 'month' ? shiftMonths(range.anchor, direction) : shiftDays(range.anchor, direction);
}

/** True when stepping forward would move past today — there are no future sales to show. */
export function isAtLatest(range: SalesDateRange): boolean {
  if (range.mode === 'all') return true;
  const today = todayString();
  return range.mode === 'month' ? range.anchor.slice(0, 7) >= today.slice(0, 7) : range.anchor >= today;
}

export function isToday(range: SalesDateRange): boolean {
  return range.mode === 'day' && range.anchor === todayString();
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const MONTH_FORMAT = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

/** Human label for the current range. Returns the English half; callers add the Arabic. */
export function rangeLabel(range: SalesDateRange): string {
  if (range.mode === 'all') return 'All dates';
  const parsed = parseDay(range.anchor);
  if (!parsed) return range.anchor;
  const date = new Date(parsed.year, parsed.monthIndex, parsed.day);
  if (range.mode === 'month') return MONTH_FORMAT.format(date);
  const today = todayString();
  if (range.anchor === today) return `Today · ${DAY_FORMAT.format(date)}`;
  if (range.anchor === shiftDays(today, -1)) return `Yesterday · ${DAY_FORMAT.format(date)}`;
  return DAY_FORMAT.format(date);
}

export interface PeriodCardLabels {
  sales: { en: string; ar: string };
  orders: { en: string; ar: string };
}

/** Labels for the two period cards, matching whatever the navigator is showing. */
export function periodCardLabels(range: SalesDateRange): PeriodCardLabels {
  if (range.mode === 'all') {
    return {
      sales: { en: 'Sales (all dates)', ar: 'المبيعات (كل التواريخ)' },
      orders: { en: 'Orders (all dates)', ar: 'الطلبات (كل التواريخ)' },
    };
  }
  if (range.mode === 'month') {
    return {
      sales: { en: 'Sales this month', ar: 'مبيعات الشهر' },
      orders: { en: 'Orders this month', ar: 'طلبات الشهر' },
    };
  }
  if (isToday(range)) {
    return {
      sales: { en: 'Sales Today', ar: 'مبيعات اليوم' },
      orders: { en: 'Orders Today', ar: 'طلبات اليوم' },
    };
  }
  return {
    sales: { en: 'Sales on this day', ar: 'مبيعات هذا اليوم' },
    orders: { en: 'Orders on this day', ar: 'طلبات هذا اليوم' },
  };
}
