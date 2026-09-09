import type { Currency } from '../../sales-orders/types/sales-orders.types';

export function formatDocumentMoney(value: string, currency: Currency): string {
  if (typeof value !== 'string' || !value) return '—';
  const sign = value.startsWith('-') ? '-' : '';
  const unsigned = sign ? value.slice(1) : value;
  const [whole, decimals] = unsigned.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const amount = decimals === undefined ? grouped : `${grouped}.${decimals}`;
  return currency === 'USD' ? `${sign}$${amount}` : `${sign}LBP ${amount}`;
}

export function DocumentMoney({ value, currency, field }: { value: string; currency: Currency; field: string }) {
  return <span dir="ltr" className="tabular-nums" data-api-field={field} data-api-value={value}>{formatDocumentMoney(value, currency)}</span>;
}
