import { formatMoney, MISSING_MONEY } from '../../../../../shared/money-format';
export { formatMoney, MISSING_MONEY, formatBusinessDate, formatDateTime } from '../../../../../shared/money-format';

/**
 * Returns the amount only when it is present and greater than zero.
 * Guards display-only money fields that may be absent (older server build) or
 * zero (nothing to show), so a missing optional field never reaches a formatter.
 */
export function positiveMoneyOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^-?0(?:\.0+)?$/.test(value.trim()) ? null : value;
}

export function formatSignedMoney(value: string): string {
  if (typeof value !== 'string' || value.trim() === '') return MISSING_MONEY;
  if (value.startsWith('-') || value === '0.00') return formatMoney(value);
  return `+${formatMoney(value)}`;
}
