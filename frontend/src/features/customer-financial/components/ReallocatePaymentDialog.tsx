import React, { useMemo, useState } from 'react';
import { useReallocatePayment } from '../hooks/useFinancialMutations';
import {
  InstallmentDetail,
  RecentFinancialPayment,
} from '../types/customer-financial.types';
import { normalizeFinancialError } from '../utils/financial-form-errors';
import { formatBusinessDate, formatMoney } from '../utils/financial-format';
import { canonicalMoneyInput, centsToMoney, isValidMoneyInput, moneyToCents } from '../utils/money-input';
import { inputClass, SubmitButton, TextField } from './CreateDebtForm';

interface ReallocatePaymentDialogProps {
  customerId: string;
  planId: string;
  payment: RecentFinancialPayment;
  schedule: InstallmentDetail[];
  onSuccess: () => void;
}

export const ReallocatePaymentDialog: React.FC<ReallocatePaymentDialogProps> = ({
  customerId,
  planId,
  payment,
  schedule,
  onSuccess,
}) => {
  const reallocatePayment = useReallocatePayment(customerId, payment.id, planId);
  const [amounts, setAmounts] = useState<Record<string, string>>(() => initialAmounts(payment, schedule));
  const [reason, setReason] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const paymentCents = moneyToCents(payment.totalAmount);
  const allocatedCents = useMemo(
    () =>
      Object.values(amounts).reduce((total, amount) => {
        const cents = moneyToCents(amount || '0');
        return cents > 0n ? total + cents : total;
      }, 0n),
    [amounts]
  );

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setServerError(null);
    setFieldError(null);

    const allocations = Object.entries(amounts)
      .map(([installmentId, amount]) => ({
        installmentId,
        amount: canonicalMoneyInput(amount),
      }))
      .filter((allocation) => moneyToCents(allocation.amount) > 0n);

    if (allocations.length === 0 || allocations.some((allocation) => !isValidMoneyInput(allocation.amount))) {
      setFieldError('Enter at least one valid allocation amount.');
      return;
    }
    if (allocatedCents !== paymentCents) {
      setFieldError(`Allocation total must equal ${formatMoney(payment.totalAmount)}.`);
      return;
    }
    if (reason.trim().length < 5) {
      setFieldError('Correction reason must be at least 5 characters.');
      return;
    }
    if (!accountPassword) {
      setFieldError('Account password is required.');
      return;
    }

    try {
      await reallocatePayment.mutateAsync({
        allocations,
        reason: reason.trim(),
        sourceScreen: 'PLAN_DETAILS',
        accountPassword,
      });
      onSuccess();
    } catch (error) {
      setServerError(normalizeFinancialError(error).message);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-900">Payment total: {formatMoney(payment.totalAmount)}</p>
        <p className="mt-1">Allocated now: {formatMoney(centsToMoney(allocatedCents))}</p>
      </div>

      {(fieldError || serverError) && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {fieldError || serverError}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3">Installment</th>
              <th className="px-4 py-3">Due date</th>
              <th className="px-4 py-3 text-right">Current remaining</th>
              <th className="px-4 py-3 text-right">New allocation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {schedule.map((installment) => (
              <tr key={installment.id}>
                <td className="px-4 py-3 font-medium text-slate-900">#{installment.installmentNumber}</td>
                <td className="px-4 py-3 text-slate-600">{formatBusinessDate(installment.dueDate)}</td>
                <td className="px-4 py-3 text-right text-slate-700">{formatMoney(installment.remainingAmount)}</td>
                <td className="px-4 py-3">
                  <input
                    value={amounts[installment.id] ?? ''}
                    onChange={(event) =>
                      setAmounts((current) => ({
                        ...current,
                        [installment.id]: event.target.value,
                      }))
                    }
                    onBlur={() =>
                      setAmounts((current) => ({
                        ...current,
                        [installment.id]: current[installment.id]
                          ? canonicalMoneyInput(current[installment.id])
                          : '',
                      }))
                    }
                    inputMode="decimal"
                    className={`${inputClass(false)} text-right`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TextField label="Correction reason">
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          className={inputClass(false)}
          placeholder="Required for audit history"
        />
      </TextField>

      <TextField label="Account password">
        <input
          value={accountPassword}
          onChange={(event) => setAccountPassword(event.target.value)}
          type="password"
          autoComplete="current-password"
          className={inputClass(false)}
        />
      </TextField>

      <SubmitButton
        isPending={reallocatePayment.isPending}
        label="Save allocation"
        pendingLabel="Saving allocation..."
      />
    </form>
  );
};

function initialAmounts(payment: RecentFinancialPayment, schedule: InstallmentDetail[]) {
  const amounts: Record<string, string> = {};
  for (const installment of schedule) {
    const currentAmount = payment.allocations
      .filter((allocation) => allocation.installmentId === installment.id)
      .reduce((total, allocation) => total + moneyToCents(allocation.amount), 0n);
    amounts[installment.id] = currentAmount > 0n ? centsToMoney(currentAmount) : '';
  }
  return amounts;
}
