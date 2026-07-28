import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { OverdueFinancialItem } from '../types/customer-financial.types';
import { formatBusinessDate, formatMoney } from '../utils/financial-format';
import { itemTypeLabels } from '../utils/financial-labels';
import { FinancialEmptyState } from './FinancialEmptyState';

interface OverdueItemsListProps {
  items: OverdueFinancialItem[];
  onOpenDebt?: (debtId: string) => void;
  onOpenPlan?: (planId: string) => void;
}

export const OverdueItemsList: React.FC<OverdueItemsListProps> = ({ items, onOpenDebt, onOpenPlan }) => {
  if (items.length === 0) {
    return (
      <FinancialEmptyState
        title="No overdue items"
        description="The customer has no overdue debts or installments."
      />
    );
  }

  return (
    <section aria-labelledby="overdue-items-heading">
      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" />
        <h2 id="overdue-items-heading" className="text-lg font-semibold text-slate-900">
          Overdue items
        </h2>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Due date</th>
              <th className="px-4 py-3 text-right">Remaining</th>
              <th className="px-4 py-3">Overdue</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={`${item.type}-${item.obligationId}`} className="align-top">
                <td className="px-4 py-3 font-medium text-red-700">{itemTypeLabels[item.type]}</td>
                <td className="user-text px-4 py-3 text-slate-900" dir="auto">{item.description}</td>
                <td className="px-4 py-3 text-slate-600">{formatBusinessDate(item.dueDate)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">
                  {formatMoney(item.remainingAmount)}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {item.daysOverdue} day{item.daysOverdue === 1 ? '' : 's'}
                </td>
                <td className="px-4 py-3 text-right">
                  {item.type === 'DEBT' ? (
                    <button
                      type="button"
                      onClick={() => onOpenDebt?.(item.obligationId)}
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    >
                      View
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => item.planId && onOpenPlan?.(item.planId)}
                      disabled={!item.planId}
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      View plan
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
