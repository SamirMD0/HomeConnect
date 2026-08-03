/** Placeholder for a money value the server did not send. */
export const MISSING_MONEY = '—';

export function formatMoney(value: string): string {
  // Typed as string so callers stay honest, but guarded at runtime: a client can
  // outlive the server build that added a field, and one absent optional value
  // must never take down a whole page.
  if (typeof value !== 'string' || value.trim() === '') return MISSING_MONEY;
  const sign = value.startsWith('-') ? '-' : '';
  const normalized = sign ? value.slice(1) : value;
  const [wholePart, decimalPart = '00'] = normalized.split('.');
  const withSeparators = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${withSeparators}.${decimalPart.padEnd(2, '0').slice(0, 2)}`;
}

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

export function formatBusinessDate(value: string | null): string {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
