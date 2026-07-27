import React, { useState } from 'react';
import {
  FinancialLedgerDebtItem,
  FinancialLedgerItem,
  FinancialLedgerPaymentItem,
  FinancialLedgerPlanItem,
} from '../types/financial-ledger.types';
import { useExpandedRows } from '../hooks/useExpandedRows';
import { LedgerObligationRow } from './LedgerObligationRow';
import { LedgerMobileCard } from './LedgerMobileCard';
import { LedgerPaymentChildRows } from './LedgerPaymentChildRows';
import { LedgerPaymentRow } from './LedgerPaymentRow';

interface LedgerTableProps {
  items: FinancialLedgerItem[];
  canMutate: boolean;
  onViewDebt: (debtId: string) => void;
  onViewPlan: (planId: string) => void;
  onRecordDebtPayment: (debt: FinancialLedgerDebtItem) => void;
  onCancelDebt: (debt: FinancialLedgerDebtItem) => void;
  onRecordPlanPayment: (plan: FinancialLedgerPlanItem) => void;
  onCancelPlan: (plan: FinancialLedgerPlanItem) => void;
  onVoidPayment: (payment: FinancialLedgerPaymentItem) => void;
}

export const LedgerTable: React.FC<LedgerTableProps> = ({
  items,
  canMutate,
  onViewDebt,
  onViewPlan,
  onRecordDebtPayment,
  onCancelDebt,
  onRecordPlanPayment,
  onCancelPlan,
  onVoidPayment,
}) => {
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const { isExpanded, toggleRow } = useExpandedRows();

  return (
    <div className="space-y-3">
      <div className="space-y-3 md:hidden">
        {items.map((item) => {
          const rowId = ledgerRowId(item);
          const childRegionId = `ledger-payments-mobile-${rowId}`;

          return (
            <LedgerMobileCard
              key={rowId}
              item={item}
              isExpanded={item.type !== 'PAYMENT' && isExpanded(rowId)}
              childRegionId={childRegionId}
              canMutate={canMutate}
              openMenuKey={openMenuKey}
              onToggleExpanded={() => toggleRow(rowId)}
              onOpenMenuChange={setOpenMenuKey}
              onViewDebt={onViewDebt}
              onViewPlan={onViewPlan}
              onRecordDebtPayment={onRecordDebtPayment}
              onCancelDebt={onCancelDebt}
              onRecordPlanPayment={onRecordPlanPayment}
              onCancelPlan={onCancelPlan}
              onVoidPayment={onVoidPayment}
            />
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <caption className="sr-only">Financial ledger</caption>
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th scope="col" className="w-10 px-2 py-3">
                <span className="sr-only">Expand</span>
              </th>
              <th scope="col" className="px-4 py-3">Due date</th>
              <th scope="col" className="px-4 py-3">Customer</th>
              <th scope="col" className="hidden px-4 py-3 lg:table-cell">Type</th>
              <th scope="col" className="px-4 py-3">Description</th>
              <th scope="col" className="px-4 py-3 text-right">Amount</th>
              <th scope="col" className="hidden px-4 py-3 text-right xl:table-cell">Paid</th>
              <th scope="col" className="px-4 py-3 text-right">Remaining</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const rowId = ledgerRowId(item);
              const childRegionId = `ledger-payments-${rowId}`;
              const expanded = item.type !== 'PAYMENT' && isExpanded(rowId);

              if (item.type === 'PAYMENT') {
                return (
                  <LedgerPaymentRow
                    key={rowId}
                    item={item}
                    canMutate={canMutate}
                    openMenuKey={openMenuKey}
                    onOpenMenuChange={setOpenMenuKey}
                    onVoidPayment={onVoidPayment}
                  />
                );
              }

              return (
                <React.Fragment key={rowId}>
                  <LedgerObligationRow
                    item={item}
                    isExpanded={expanded}
                    childRegionId={childRegionId}
                    canMutate={canMutate}
                    openMenuKey={openMenuKey}
                    onToggleExpanded={() => toggleRow(rowId)}
                    onOpenMenuChange={setOpenMenuKey}
                    onViewDebt={onViewDebt}
                    onViewPlan={onViewPlan}
                    onRecordDebtPayment={onRecordDebtPayment}
                    onCancelDebt={onCancelDebt}
                    onRecordPlanPayment={onRecordPlanPayment}
                    onCancelPlan={onCancelPlan}
                  />
                  {expanded && <LedgerPaymentChildRows item={item} regionId={childRegionId} />}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
};

function ledgerRowId(item: FinancialLedgerItem): string {
  return `${item.type}-${item.id}`;
}
