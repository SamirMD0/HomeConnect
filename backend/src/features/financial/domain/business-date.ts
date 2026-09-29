import { InvalidBusinessDateError } from './financial-errors';

export type BusinessDate = string;

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_BUSINESS_TIMEZONE = 'Asia/Beirut';

export function getBusinessTimezone(): string {
  return process.env.BUSINESS_TIMEZONE || DEFAULT_BUSINESS_TIMEZONE;
}

export function parseBusinessDate(input: string): BusinessDate {
  if (!BUSINESS_DATE_PATTERN.test(input)) {
    throw new InvalidBusinessDateError('Business date must use YYYY-MM-DD format');
  }

  const [yearPart, monthPart, dayPart] = input.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (!isValidCalendarDate(year, month, day)) {
    throw new InvalidBusinessDateError('Business date is not a valid calendar date');
  }

  return input;
}

export function businessDateToPrisma(input: string): Date {
  const businessDate = parseBusinessDate(input);
  const { year, month, day } = splitBusinessDate(businessDate);
  return new Date(Date.UTC(year, month - 1, day));
}

export function prismaDateToBusinessDate(input: Date): BusinessDate {
  const year = input.getUTCFullYear();
  const month = input.getUTCMonth() + 1;
  const day = input.getUTCDate();
  return parseBusinessDate(formatDateParts(year, month, day));
}

export function compareBusinessDates(left: string, right: string): -1 | 0 | 1 {
  const leftDate = parseBusinessDate(left);
  const rightDate = parseBusinessDate(right);
  if (leftDate < rightDate) return -1;
  if (leftDate > rightDate) return 1;
  return 0;
}

export function isBusinessDatePast(dueDate: string, businessDate: string): boolean {
  return compareBusinessDates(dueDate, businessDate) < 0;
}

export function todayInBusinessTimezone(
  timezone = getBusinessTimezone(),
  now = new Date()
): BusinessDate {
  return timestampToBusinessDate(timezone, now);
}

/**
 * UTC instant of the local midnight starting the given business date in the
 * configured timezone. Use this to filter timestamp (@db.Timestamp) columns
 * such as createdAt, whose values are absolute instants rather than
 * date-only markers. Do not use it to compare against @db.Date columns, which
 * are already stored as UTC midnight of the business date.
 */
export function businessDateStartInstant(
  businessDate: string,
  timezone = getBusinessTimezone()
): Date {
  const { year, month, day } = splitBusinessDate(parseBusinessDate(businessDate));
  // Start with a UTC guess for that wall-clock instant, then correct by the
  // offset the target timezone reported for it. One pass is exact for every
  // moment except the ambiguous hour of a DST fall-back, and the report
  // boundary is not that hour.
  const guess = Date.UTC(year, month - 1, day);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(guess));
  const local = { y: 0, m: 0, d: 0, h: 0, min: 0, s: 0 };
  for (const part of parts) {
    if (part.type === 'year') local.y = Number(part.value);
    else if (part.type === 'month') local.m = Number(part.value);
    else if (part.type === 'day') local.d = Number(part.value);
    else if (part.type === 'hour') local.h = Number(part.value) === 24 ? 0 : Number(part.value);
    else if (part.type === 'minute') local.min = Number(part.value);
    else if (part.type === 'second') local.s = Number(part.value);
  }
  const asUTC = Date.UTC(local.y, local.m - 1, local.d, local.h, local.min, local.s);
  const offsetMs = asUTC - guess;
  return new Date(guess - offsetMs);
}

export function timestampToBusinessDate(timezone: string, timestamp: Date): BusinessDate {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(timestamp);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new InvalidBusinessDateError('Unable to determine business date');
  }

  return parseBusinessDate(`${year}-${month}-${day}`);
}

export function addMonthsToBusinessDate(input: string, monthsToAdd: number): BusinessDate {
  if (!Number.isInteger(monthsToAdd)) {
    throw new InvalidBusinessDateError('Months to add must be an integer');
  }

  const { year, month, day } = splitBusinessDate(parseBusinessDate(input));
  const targetMonthIndex = month - 1 + monthsToAdd;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = modulo(targetMonthIndex, 12);
  const targetMonth = normalizedMonthIndex + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));

  return parseBusinessDate(formatDateParts(targetYear, targetMonth, targetDay));
}

export function addWeeksToBusinessDate(input: string, weeksToAdd: number): BusinessDate {
  if (!Number.isInteger(weeksToAdd)) {
    throw new InvalidBusinessDateError('Weeks to add must be an integer');
  }
  const date = businessDateToPrisma(input);
  date.setUTCDate(date.getUTCDate() + weeksToAdd * 7);
  return prismaDateToBusinessDate(date);
}

export function splitBusinessDate(input: string): { year: number; month: number; day: number } {
  const businessDate = parseBusinessDate(input);
  const [yearPart, monthPart, dayPart] = businessDate.split('-');
  return {
    year: Number(yearPart),
    month: Number(monthPart),
    day: Number(dayPart),
  };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
