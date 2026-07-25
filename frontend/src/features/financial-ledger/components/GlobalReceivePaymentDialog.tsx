import React, { useState } from 'react';
import { Customer } from '../../customers/api/customers.api';
import { RecordDebtPaymentDialog } from '../../customer-financial/components/RecordDebtPaymentDialog';
import { RecordPlanPaymentDialog } from '../../customer-financial/components/RecordPlanPaymentDialog';
import { FinancialErrorState } from '../../customer-financial/components/FinancialErrorState';
import { FinancialStatusBadge } from '../../customer-financial/components/FinancialStatusBadge';
import { useCustomerFinancialSummary } from '../../customer-financial/hooks/useCustomerFinancialSummary';
import {
  DebtSummaryItem,
  InstallmentPlanSummaryItem,
} from '../../customer-financial/types/customer-financial.types';
import {
  canRecordDebtPayment,
  canRecordInstallmentPlanPayment,
} from '../../customer-financial/utils/financial-auth';
import { formatBusinessDate, formatMoney } from '../../customer-financial/utils/financial-format';
import { CustomerPicker } from './CustomerPicker';

interface GlobalReceivePaymentDialogProps {
  onSuccess: () => void;
}

type SelectedTarget =
  | { type: 'DEBT'; debt: DebtSummaryItem }
  | { type: 'INSTALLMENT_PLAN'; plan: InstallmentPlanSummaryItem }
  | null;

export const GlobalReceivePaymentDialog: React.FC<GlobalReceivePaymentDialogProps> = ({
  onSuccess,
}) => {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<SelectedTarget>(null);

  if (!selectedCustomer) {
    return <CustomerPicker selectedCustomer={selectedCustomer} onSelect={setSelectedCustomer} />;
  }

  if (selectedTarget?.type === 'DEBT') {
    return (
      <RecordDebtPaymentDialog
        customerId={selectedCustomer.id}
        debt={selectedTarget.debt}
        onSuccess={onSuccess}
      />
    );
  }

  if (selectedTarget?.type === 'INSTALLMENT_PLAN') {
    return (
      <RecordPlanPaymentDialog
        customerId={selectedCustomer.id}
        plan={selectedTarget.plan}
        onSuccess={onSuccess}
      />
    );
  }

  return (
    <EligibleObligationPicker
      customer={selectedCustomer}
      onChangeCustomer={() => setSelectedCustomer(null)}
      onSelectDebt={(debt) => setSelectedTarget({ type: 'DEBT', debt })}
      onSelectPlan={(plan) => setSelectedTarget({ type: 'INSTALLMENT_PLAN', plan })}
    />
  );
};

interface EligibleObligationPickerProps {
  customer: Customer;
  onChangeCustomer: () => void;
  onSelectDebt: (debt: DebtSummaryItem) => void;
  onSelectPlan: (plan: InstallmentPlanSummaryItem) => void;
}

const EligibleObligationPicker: React.FC<EligibleObligationPickerProps> = ({
  customer,
  onChangeCustomer,
  onSelectDebt,
  onSelectPlan,
}) => {
  const { data, isLoading, isError, refetch } = useCustomerFinancialSummary(customer.id, {
    includeCancelled: false,
    includePayments: false,
    debtLimit: 100,
    planLimit: 100,
  });

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-slate-500">Loading eligible obligations...</p>;
  }

  if (isError || !data) {
    return (
      <FinancialErrorState
        message="Eligible obligations could not be loaded."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const debts = data.debts.filter((debt) => canRecordDebtPayment(debt.calculatedStatus));
  const plans = data.installmentPlans.filter((plan) =>
    canRecordInstallmentPlanPayment(plan.calculatedStatus)
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</p>
        <p className="mt-1 font-semibold text-slate-900">{customer.name}</p>
        <p className="text-sm text-slate-600">{customer.phone}</p>
        <button type="button" onClick={onChangeCustomer} className="mt-2 text-sm font-medium text-emerald-700">
          Change customer
        </button>
      </div>

      {debts.length === 0 && plans.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          No unpaid debts or installment plans are eligible for payment.
        </div>
      ) : (
        <div className="space-y-3">
          {debts.map((debt) => (
            <button
              key={debt.id}
              type="button"
              onClick={() => onSelectDebt(debt)}
              className="block w-full rounded-lg border border-slate-200 bg-white p-3 text-left hover:bg-emerald-50"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{debt.description}</span>
                <FinancialStatusBadge type="debt" status={debt.calculatedStatus} />
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Remaining {formatMoney(debt.remainingBalance)} · Due {formatBusinessDate(debt.dueDate)}
              </p>
            </button>
          ))}
          {plans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => onSelectPlan(plan)}
              className="block w-full rounded-lg border border-slate-200 bg-white p-3 text-left hover:bg-emerald-50"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{plan.description}</span>
                <FinancialStatusBadge type="plan" status={plan.calculatedStatus} />
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Remaining {formatMoney(plan.remainingBalance)} · Next due {formatBusinessDate(plan.nextDueDate)}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
