import { useState } from 'react';
import { BilingualLabel } from '../../../components/ui';
import { useSupplierStatement } from '../hooks/useCustomerStatement';
import type { SupplierStatement } from '../types/document.types';
import { defaultStatementRange, splitEffect, StatementRow, StatementTable } from './StatementTable';

export const SUPPLIER_ENTRY_LABELS: Record<SupplierStatement['entries'][number]['type'], string> = {
  SUPPLIER_DEBT: 'Debt',
  SUPPLIER_PAYMENT: 'Payment',
  SUPPLIER_CREDIT: 'Credit',
  SUPPLIER_ADJUSTMENT: 'Adjustment',
};

/** On the supplier's account what you come to owe is a credit and a payment is a debit. */
export function toSupplierStatementRows(entries: SupplierStatement['entries']): StatementRow[] {
  return entries.map((entry) => ({
    id: entry.id,
    date: entry.date,
    type: SUPPLIER_ENTRY_LABELS[entry.type],
    description: entry.description,
    reference: entry.reference,
    ...splitEffect(entry.balanceEffect, 'credit'),
    balance: entry.runningBalance,
    inactiveLabel: entry.status === 'REMOVED' ? 'Removed' : null,
    reason: entry.status === 'REMOVED' ? entry.reason : null,
  }));
}

export function SupplierStatementPanel({ supplierId }: { supplierId: string }) {
  const [range, setRange] = useState(() => defaultStatementRange());
  const statement = useSupplierStatement(supplierId, range.from, range.to);
  return (
    <StatementTable
      title={<BilingualLabel compact label={{ en: 'Statement of account', ar: 'كشف حساب' }} />}
      explanation="Credit is what you came to owe this supplier, debit is what you paid or were credited. The balance is what you owe them."
      from={range.from}
      to={range.to}
      onRangeChange={setRange}
      printHref={`/suppliers/${supplierId}/statement?from=${range.from}&to=${range.to}`}
      isLoading={statement.isLoading}
      isError={statement.isError}
      onRetry={() => statement.refetch()}
      openingBalance={statement.data?.openingBalance}
      closingBalance={statement.data?.closingBalance}
      rows={statement.data ? toSupplierStatementRows(statement.data.entries) : undefined}
    />
  );
}
