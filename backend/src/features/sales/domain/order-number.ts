const ORDER_NUMBER_PATTERN = /^SO-(\d{4})-(\d{4,})$/;

export function formatSalesOrderNumber(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new Error('Invalid sales order year');
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error('Invalid sales order sequence');
  }
  return `SO-${year}-${String(sequence).padStart(4, '0')}`;
}

export function nextSalesOrderNumber(year: number, latest?: string | null): string {
  if (!latest) return formatSalesOrderNumber(year, 1);
  const match = ORDER_NUMBER_PATTERN.exec(latest);
  if (!match || Number(match[1]) !== year) return formatSalesOrderNumber(year, 1);
  return formatSalesOrderNumber(year, Number(match[2]) + 1);
}
