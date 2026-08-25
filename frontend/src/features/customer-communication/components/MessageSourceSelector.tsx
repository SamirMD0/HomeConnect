import React from 'react';
import { Info } from 'lucide-react';
import { businessLabels } from '../../../shared/labels/business-labels';
import {
  DebtSummaryItem,
  InstallmentPlanSummaryItem,
} from '../../customer-financial/types/customer-financial.types';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import { MessageSource, MessageSourceKind } from '../types/communication.types';

interface MessageSourceSelectorProps {
  source: MessageSource;
  debts: DebtSummaryItem[];
  plans: InstallmentPlanSummaryItem[];
  totalOutstanding: string;
  notice: string | null;
  onChange: (source: MessageSource) => void;
}

const optionLabels: Record<MessageSourceKind, string> = {
  TOTAL: businessLabels.communication.totalOutstanding,
  DEBT: businessLabels.communication.specificDebt,
  INSTALLMENT: businessLabels.communication.specificInstallment,
  MANUAL: businessLabels.communication.manualAmount,
};

export const MessageSourceSelector: React.FC<MessageSourceSelectorProps> = ({
  source,
  debts,
  plans,
  totalOutstanding,
  notice,
  onChange,
}) => {
  const radio = (kind: MessageSourceKind, id: string | null) => (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="radio"
        name="communication-source"
        value={kind}
        checked={source.kind === kind}
        onChange={() => onChange({ kind, id })}
        className="h-4 w-4 text-emerald-600"
      />
      <span>{optionLabels[kind]}</span>
    </label>
  );

  return (
    <fieldset className="rounded-xl border border-slate-200 p-3">
      <legend className="px-1 text-sm font-medium text-slate-700">
        {businessLabels.communication.dataSource}
      </legend>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {radio('TOTAL', null)}
          <span className="text-sm font-semibold text-slate-900">{totalOutstanding}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {radio('DEBT', debts[0]?.id ?? null)}
          <select
            aria-label={businessLabels.communication.specificDebt}
            value={source.kind === 'DEBT' ? source.id ?? '' : ''}
            disabled={source.kind !== 'DEBT' || debts.length === 0}
            onChange={(event) => onChange({ kind: 'DEBT', id: event.target.value })}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"
          >
            {debts.length === 0 && <option value="">No debts / لا يوجد ديون</option>}
            {debts.map((debt) => (
              <option key={debt.id} value={debt.id}>
                {debt.description} — {formatMoney(debt.remainingBalance)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {radio('INSTALLMENT', plans[0]?.id ?? null)}
          <select
            aria-label={businessLabels.communication.specificInstallment}
            value={source.kind === 'INSTALLMENT' ? source.id ?? '' : ''}
            disabled={source.kind !== 'INSTALLMENT' || plans.length === 0}
            onChange={(event) => onChange({ kind: 'INSTALLMENT', id: event.target.value })}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"
          >
            {plans.length === 0 && <option value="">No plans / لا يوجد خطط</option>}
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.description} — {formatMoney(plan.remainingBalance)}
              </option>
            ))}
          </select>
        </div>

        {radio('MANUAL', null)}
      </div>

      {notice && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {notice}
        </p>
      )}
    </fieldset>
  );
};
