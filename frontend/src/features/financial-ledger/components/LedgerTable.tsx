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
  onEditDebt: (debt: FinancialLedgerDebtItem) => void;
  onEditPlan: (plan: FinancialLedgerPlanItem) => void;
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
  onEditDebt,
  onEditPlan,
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
              onEditDebt={onEditDebt}
              onEditPlan={onEditPlan}
              onRecordDebtPayment={onRecordDebtPayment}
              onCancelDebt={onCancelDebt}
              onRecordPlanPayment={onRecordPlanPayment}
              onCancelPlan={onCancelPlan}
              onVoidPayment={onVoidPayment}
            />
          );
        })}
      </div>

      <div
        className="hidden max-h-[22rem] overflow-auto overscroll-contain rounded-lg bg-slate-100 px-3 pb-3 md:block"
        data-testid="ledger-scroll-table"
      >
        <table className="min-w-full border-separate border-spacing-y-1.5 text-xs text-slate-600">
          <caption className="sr-only">Financial Ledger / دفتر الحسابات</caption>
          <thead className="sticky top-0 z-10 bg-slate-100 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
            <tr>
              <th scope="col" className="w-10 px-2 py-2.5">
                <span className="sr-only">Expand</span>
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-2.5">Due date</th>
              <th scope="col" className="whitespace-nowrap px-4 py-2.5">Customer</th>
              <th scope="col" className="hidden whitespace-nowrap px-4 py-2.5 lg:table-cell">Type</th>
              <th scope="col" className="whitespace-nowrap px-4 py-2.5">Description</th>
              <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-right">Amount</th>
              <th scope="col" className="hidden whitespace-nowrap px-4 py-2.5 text-right xl:table-cell">Paid</th>
              <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-right">Balance</th>
              <th scope="col" className="whitespace-nowrap px-4 py-2.5">Status</th>
              <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
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
                    onEditDebt={onEditDebt}
                    onEditPlan={onEditPlan}
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
  );
};

function ledgerRowId(item: FinancialLedgerItem): string {
  return `${item.type}-${item.id}`;
}
