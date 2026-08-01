import React, { useState } from 'react';
import { FinancialSummaryCustomer } from '../types/customer-financial.types';
import { CreateDebtForm } from './CreateDebtForm';
import { CreateInstallmentPlanForm } from './CreateInstallmentPlanForm';
import { CreatePrepaidPurchaseForm } from './CreatePrepaidPurchaseForm';
import {
  FinancialObligationType,
  FinancialObligationTypeStep,
} from './FinancialObligationTypeStep';
import { businessLabels } from '../../../shared/labels/business-labels';

interface AddFinancialObligationDialogProps {
  customer: FinancialSummaryCustomer;
  onSuccess: () => void;
}

export const AddFinancialObligationDialog: React.FC<AddFinancialObligationDialogProps> = ({
  customer,
  onSuccess,
}) => {
  const [selectedType, setSelectedType] = useState<FinancialObligationType | null>(null);

  if (selectedType === 'debt') {
    return (
      <CreateDebtForm
        customer={customer}
        onBack={() => setSelectedType(null)}
        onSuccess={onSuccess}
      />
    );
  }

  if (selectedType === 'installment-plan') {
    return (
      <CreateInstallmentPlanForm
        customer={customer}
        onBack={() => setSelectedType(null)}
        onSuccess={onSuccess}
      />
    );
  }

  if (selectedType === 'prepaid-purchase') {
    return (
      <CreatePrepaidPurchaseForm
        customer={customer}
        onBack={() => setSelectedType(null)}
        onSuccess={onSuccess}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{businessLabels.common.customer}</p>
        <p className="user-text mt-1 font-semibold text-slate-900" dir="auto">{customer.name}</p>
        <p className="text-sm text-slate-600">{customer.phone}</p>
      </div>
      <FinancialObligationTypeStep selectedType={selectedType} onSelect={setSelectedType} />
    </div>
  );
};
