/** Placeholder for a money value the server did not send. */
export const MISSING_MONEY = '—';

export function formatMoney(value: string, currency: 'USD' | 'LBP' = 'USD'): string {
  // Typed as string so callers stay honest, but guarded at runtime: a client can
  // outlive the server build that added a field, and one absent optional value
  // must never take down a whole page.
  if (typeof value !== 'string' || value.trim() === '') return MISSING_MONEY;
  const sign = value.startsWith('-') ? '-' : '';
  const normalized = sign ? value.slice(1) : value;
  const [wholePart = '', decimalPart = '00'] = normalized.split('.');
  const withSeparators = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return currency === 'LBP'
    ? `${sign}${withSeparators} LBP`
    : `${sign}$${withSeparators}.${decimalPart.padEnd(2, '0').slice(0, 2)}`;
}
