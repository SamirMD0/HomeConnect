import React, { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useUpdateInstallmentPlan } from '../hooks/useFinancialMutations';
import {
  UpdateInstallmentPlanFormValues,
  updateInstallmentPlanSchema,
} from '../schemas/financial-mutation.schemas';
import { InstallmentPlanDetail } from '../types/customer-financial.types';
import { normalizeFinancialError } from '../utils/financial-form-errors';
import { formatMoney } from '../utils/financial-format';
import { inputClass, SubmitButton, TextField } from './CreateDebtForm';

interface EditInstallmentPlanDialogProps {
  customerId: string;
  plan: InstallmentPlanDetail;
  onSuccess: () => void;
}

export const EditInstallmentPlanDialog: React.FC<EditInstallmentPlanDialogProps> = ({
  customerId,
  plan,
  onSuccess,
}) => {
  const updatePlan = useUpdateInstallmentPlan(customerId, plan.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<UpdateInstallmentPlanFormValues>({
    resolver: zodResolver(updateInstallmentPlanSchema),
    defaultValues: {
      totalAmount: plan.totalAmount,
      description: plan.description,
      startDate: plan.startDate,
      installmentCount: plan.installmentCount,
      notes: plan.notes ?? '',
      reason: '',
      accountPassword: '',
    },
  });

  const onSubmit = async (values: UpdateInstallmentPlanFormValues) => {
    setServerError(null);
    try {
      await updatePlan.mutateAsync({
        totalAmount: values.totalAmount.trim(),
        description: values.description.trim(),
        startDate: values.startDate,
        installmentCount: values.installmentCount,
        notes: values.notes?.trim() || null,
        reason: values.reason.trim(),
        sourceScreen: 'PLAN_DETAILS',
        accountPassword: values.accountPassword,
      });
      onSuccess();
    } catch (error) {
      const normalized = normalizeFinancialError(error);
      setServerError(normalized.message);
      if (normalized.fieldErrors.description) {
        setError('description', { message: normalized.fieldErrors.description });
      }
      if (normalized.fieldErrors.totalAmount) {
        setError('totalAmount', { message: normalized.fieldErrors.totalAmount });
      }
      if (normalized.fieldErrors.startDate) {
        setError('startDate', { message: normalized.fieldErrors.startDate });
      }
      if (normalized.fieldErrors.installmentCount) {
        setError('installmentCount', { message: normalized.fieldErrors.installmentCount });
      }
      if (normalized.fieldErrors.notes) {
        setError('notes', { message: normalized.fieldErrors.notes });
      }
      if (normalized.fieldErrors.reason) {
        setError('reason', { message: normalized.fieldErrors.reason });
      }
      if (normalized.fieldErrors.accountPassword) {
        setError('accountPassword', { message: normalized.fieldErrors.accountPassword });
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-900">{plan.description}</p>
        <p className="mt-1">
          Total {formatMoney(plan.totalAmount)} · Paid {formatMoney(plan.totalPaid)} · Remaining{' '}
          {formatMoney(plan.remainingBalance)}
        </p>
      </div>

      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {serverError}
        </div>
      )}

      <TextField label="Total amount" error={errors.totalAmount?.message}>
        <input
          {...register('totalAmount')}
          inputMode="decimal"
          className={inputClass(Boolean(errors.totalAmount))}
        />
      </TextField>

      <TextField label="Description" error={errors.description?.message}>
        <input
          {...register('description')}
          className={inputClass(Boolean(errors.description))}
        />
      </TextField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Start date" error={errors.startDate?.message}>
          <input
            {...register('startDate')}
            type="date"
            className={inputClass(Boolean(errors.startDate))}
          />
        </TextField>

        <TextField label="Installments" error={errors.installmentCount?.message}>
          <input
            {...register('installmentCount', { valueAsNumber: true })}
            type="number"
            min={1}
            max={120}
            className={inputClass(Boolean(errors.installmentCount))}
          />
        </TextField>
      </div>

      <TextField label="Notes" error={errors.notes?.message}>
        <textarea
          {...register('notes')}
          rows={3}
          className={inputClass(Boolean(errors.notes))}
          placeholder="Optional"
        />
      </TextField>

      <TextField label="Correction reason" error={errors.reason?.message}>
        <textarea
          {...register('reason')}
          rows={3}
          className={inputClass(Boolean(errors.reason))}
          placeholder="Required for audit history"
        />
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
        isPending={updatePlan.isPending}
        label="Save changes"
        pendingLabel="Saving changes..."
      />
    </form>
  );
};
