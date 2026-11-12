import type { Currency } from '@shared/lookup-contracts';

export function reportPercentageField(key: string): boolean {
  return /percent/i.test(key) || key === 'shareOfSales';
}
export function reportMoneyField(key: string, value: unknown): boolean {
  return (
    typeof value === 'string' &&
    /^-?\d+(?:\.\d+)?$/.test(value) &&
    !reportPercentageField(key) &&
    !/rate|count|days|units|quantity|month|year/i.test(key) &&
    /amount|balance|owed|paid|price|cost|sales|gross|net|credit|debit|collected|opening|closing|refund|debt|remaining|returns|billed|collections|payments|profit|outstanding|obligation|allocation|receivable|payable|revenue|vat|adjustment|difference|moneyIn|moneyOut|stockValue|retailValue|averageOrder|increased?|decreased?|reportedTotal|independentTotal|over30|over60|over90/i.test(
      key
    )
  );
}
/** Report totals and ledger balances are base USD, even when a row retains its source currency. */
export function reportFieldCurrency(reportId: string, key: string, original: Currency): Currency {
  return (reportId === 'customers-payments' && key === 'amount') ||
    (reportId === 'suppliers-aging' && key === 'transactionAmount')
    ? original
    : 'USD';
}
export function visibleReportField(key: string) {
  return !/(^id$|Ids?$|^ar$|^documentRoute$|^generatedAt$)/.test(key);
}
