import React from 'react';
import { CalendarClock } from 'lucide-react';
import { NextDueSummary } from '../types/customer-financial.types';
import { formatBusinessDate, formatMoney } from '../utils/financial-format';
import { itemTypeLabels } from '../utils/financial-labels';
import { FinancialEmptyState } from './FinancialEmptyState';

interface NextDueCardProps {
  nextDue: NextDueSummary | null;
  onOpenDebt?: (debtId: string) => void;
  onOpenPlan?: (planId: string) => void;
}

export const NextDueCard: React.FC<NextDueCardProps> = ({ nextDue, onOpenDebt, onOpenPlan }) => {
  if (!nextDue) {
    return (
      <FinancialEmptyState
        title="No outstanding payments"
        description="This customer has no active due debt or installment payment."
      />
    );
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="next-due-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="next-due-heading" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <CalendarClock className="h-5 w-5 text-amber-600" aria-hidden="true" />
            Next required payment
          </h2>
          <p className="mt-1 text-sm text-slate-500">{formatBusinessDate(nextDue.date)}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-sm font-medium text-slate-500">Combined amount</p>
          <p className="text-2xl font-bold text-slate-900">{formatMoney(nextDue.totalAmount)}</p>
        </div>
      </div>

      <ul className="mt-5 divide-y divide-slate-100 rounded-lg border border-slate-100">
        {nextDue.items.map((item) => {
          const planId = item.planId;
          const canOpenPlan = item.type === 'INSTALLMENT' && planId !== null;
          return (
            <li key={`${item.type}-${item.id}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {itemTypeLabels[item.type]}
                </span>
                <p className="user-text mt-1 font-medium text-slate-900" dir="auto">{item.description}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-slate-900">{formatMoney(item.remainingAmount)}</span>
                {item.type === 'DEBT' && (
                  <button
                    type="button"
                    onClick={() => onOpenDebt?.(item.id)}
                    className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  >
                    View
                  </button>
                )}
                {canOpenPlan && (
                  <button
                    type="button"
                    onClick={() => onOpenPlan?.(planId)}
                    className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  >
                    View plan
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
