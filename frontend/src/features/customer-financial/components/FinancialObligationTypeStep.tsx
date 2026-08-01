import React from 'react';
import { CalendarDays, HandCoins, ReceiptText } from 'lucide-react';
import { businessLabels } from '../../../shared/labels/business-labels';

export type FinancialObligationType = 'debt' | 'installment-plan' | 'prepaid-purchase';

interface FinancialObligationTypeStepProps {
  selectedType: FinancialObligationType | null;
  onSelect: (type: FinancialObligationType) => void;
}

export const FinancialObligationTypeStep: React.FC<FinancialObligationTypeStepProps> = ({
  selectedType,
  onSelect,
}) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Financial obligation type">
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
      <p className="font-semibold text-slate-900">{businessLabels.financial.singleDebt}</p>
      <p className="mt-1 text-sm text-slate-500">One amount with an exact due date / مبلغ واحد بتاريخ استحقاق محدد.</p>
    </button>
    <button
      type="button"
      role="radio"
      aria-checked={selectedType === 'prepaid-purchase'}
      onClick={() => onSelect('prepaid-purchase')}
      className={`rounded-lg border p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
        selectedType === 'prepaid-purchase'
          ? 'border-emerald-500 bg-emerald-50'
          : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      <HandCoins className="mb-3 h-5 w-5 text-emerald-600" />
      <p className="font-semibold text-slate-900">{businessLabels.financial.prepaidPurchase}</p>
      <p className="mt-1 text-sm text-slate-500">Reserve an item and collect an initial payment / حجز سلعة وتسجيل دفعة أولى.</p>
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
      <p className="font-semibold text-slate-900">{businessLabels.financial.installmentPlan}</p>
      <p className="mt-1 text-sm text-slate-500">Monthly payment schedule / جدول دفعات شهرية.</p>
    </button>
  </div>
);
