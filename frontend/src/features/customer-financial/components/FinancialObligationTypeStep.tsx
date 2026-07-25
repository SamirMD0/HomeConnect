import React from 'react';
import { CalendarDays, ReceiptText } from 'lucide-react';

export type FinancialObligationType = 'debt' | 'installment-plan';

interface FinancialObligationTypeStepProps {
  selectedType: FinancialObligationType | null;
  onSelect: (type: FinancialObligationType) => void;
}

export const FinancialObligationTypeStep: React.FC<FinancialObligationTypeStepProps> = ({
  selectedType,
  onSelect,
}) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Financial obligation type">
    <button
      type="button"
      role="radio"
      aria-checked={selectedType === 'debt'}
      onClick={() => onSelect('debt')}
      className={`rounded-lg border p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
        selectedType === 'debt'
          ? 'border-emerald-500 bg-emerald-50'
          : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      <ReceiptText className="mb-3 h-5 w-5 text-emerald-600" />
      <p className="font-semibold text-slate-900">Single debt</p>
      <p className="mt-1 text-sm text-slate-500">One obligation with an exact due date.</p>
    </button>
    <button
      type="button"
      role="radio"
      aria-checked={selectedType === 'installment-plan'}
      onClick={() => onSelect('installment-plan')}
      className={`rounded-lg border p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
        selectedType === 'installment-plan'
          ? 'border-emerald-500 bg-emerald-50'
          : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      <CalendarDays className="mb-3 h-5 w-5 text-emerald-600" />
      <p className="font-semibold text-slate-900">Installment plan</p>
      <p className="mt-1 text-sm text-slate-500">Monthly schedule previewed before creation.</p>
    </button>
  </div>
);
