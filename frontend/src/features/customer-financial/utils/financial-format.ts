export function formatMoney(value: string): string {
  const sign = value.startsWith('-') ? '-' : '';
  const normalized = sign ? value.slice(1) : value;
  const [wholePart, decimalPart = '00'] = normalized.split('.');
  const withSeparators = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${withSeparators}.${decimalPart.padEnd(2, '0').slice(0, 2)}`;
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
