import { useState } from 'react';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import { useCustomerStatement } from '../hooks/useCustomerStatement';
import type { CustomerStatement } from '../types/document.types';
import { defaultStatementRange, splitEffect, StatementRow, StatementTable } from './StatementTable';

const TYPE_LABELS: Record<CustomerStatement['entries'][number]['type'], string> = {
  DEBT: 'Debt',
  INSTALLMENT: 'Installment',
  PAYMENT: 'Payment',
  RETURN: 'Sales return',
};

const INACTIVE_LABELS = { VOIDED: 'Voided', CANCELLED: 'Cancelled' } as const;

/** A prepaid deposit is real money that isn't part of what the customer owes, so say why its amounts are empty. */
function outsideBalanceNote(entry: CustomerStatement['entries'][number]): string | null {
  if (entry.status !== 'POSTED' || Number(entry.balanceEffect) !== 0) return null;
  return `${formatMoney(entry.originalAmount, entry.currency)} paid towards a prepaid or cancelled item, so it doesn't change this balance.`;
}

export function toCustomerStatementRows(entries: CustomerStatement['entries']): StatementRow[] {
  return entries.map((entry) => ({
    id: `${entry.type}-${entry.id}`,
    date: entry.date,
    type: TYPE_LABELS[entry.type],
    description: entry.description,
    reference: entry.reference,
    ...splitEffect(entry.balanceEffect, 'debit'),
    balance: entry.runningBalance,
    inactiveLabel: entry.status === 'POSTED' ? null : INACTIVE_LABELS[entry.status],
    reason: entry.reason ?? outsideBalanceNote(entry),
  }));
}

export function CustomerStatementPanel({ customerId }: { customerId: string }) {
  const [range, setRange] = useState(() => defaultStatementRange());
  const statement = useCustomerStatement(customerId, range.from, range.to);
  return (
    <StatementTable
      title="Statement of account"
      explanation="Debit is what the customer was charged, credit is what they paid. The balance is what they owe."
      from={range.from}
      to={range.to}
      onRangeChange={setRange}
      printHref={`/customers/${customerId}/statement?from=${range.from}&to=${range.to}`}
      isLoading={statement.isLoading}
      isError={statement.isError}
      onRetry={() => statement.refetch()}
      openingBalance={statement.data?.openingBalance}
      closingBalance={statement.data?.closingBalance}
      rows={statement.data ? toCustomerStatementRows(statement.data.entries) : undefined}
    />
  );
}
