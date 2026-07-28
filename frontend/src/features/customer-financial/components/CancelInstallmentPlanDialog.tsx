import React, { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { AlertTriangle } from 'lucide-react';
import { useCancelInstallmentPlan } from '../hooks/useFinancialMutations';
import {
  CancelFinancialRecordFormValues,
  cancelFinancialRecordSchema,
} from '../schemas/financial-mutation.schemas';
import { normalizeFinancialError } from '../utils/financial-form-errors';
import { formatMoney } from '../utils/financial-format';
import { inputClass, SubmitButton, TextField } from './CreateDebtForm';
import { PlanPaymentTarget } from './RecordPlanPaymentDialog';

interface CancelInstallmentPlanDialogProps {
  customerId: string;
  plan: PlanPaymentTarget;
  onSuccess: () => void;
}

export const CancelInstallmentPlanDialog: React.FC<CancelInstallmentPlanDialogProps> = ({
  customerId,
  plan,
  onSuccess,
}) => {
  const cancelPlan = useCancelInstallmentPlan(customerId, plan.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CancelFinancialRecordFormValues>({
    resolver: zodResolver(cancelFinancialRecordSchema),
    defaultValues: { reason: '', accountPassword: '' },
  });

  const onSubmit = async (values: CancelFinancialRecordFormValues) => {
    setServerError(null);
    try {
      await cancelPlan.mutateAsync({
        reason: values.reason.trim(),
        accountPassword: values.accountPassword,
      });
      onSuccess();
    } catch (error) {
      const normalized = normalizeFinancialError(error);
      setServerError(normalized.message);
      if (normalized.fieldErrors.reason) setError('reason', { message: normalized.fieldErrors.reason });
      if (normalized.fieldErrors.accountPassword) {
        setError('accountPassword', { message: normalized.fieldErrors.accountPassword });
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="mb-2 flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4" />
          Cancellation preserves history
        </div>
        <p className="user-text" dir="auto">
          This will cancel {plan.description}. Total amount {formatMoney(plan.totalAmount)},
          remaining balance {formatMoney(plan.remainingBalance)}. The plan, schedule, payments, and
          allocations are kept; no records are deleted.
        </p>
        <p className="mt-2">Plans with valid payments may be rejected by backend policy.</p>
      </div>
      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {serverError}
        </div>
      )}
      <TextField label="Cancellation reason" error={errors.reason?.message}>
        <textarea {...register('reason')} dir="auto" rows={4} className={inputClass(Boolean(errors.reason))} />
      </TextField>
      <TextField label="Account password" error={errors.accountPassword?.message}>
        <input
          {...register('accountPassword')}
          type="password"
          autoComplete="current-password"
          className={inputClass(Boolean(errors.accountPassword))}
        />
      </TextField>
      <SubmitButton
        isPending={cancelPlan.isPending}
        label="Cancel installment plan"
        pendingLabel="Cancelling plan..."
      />
    </form>
  );
};
