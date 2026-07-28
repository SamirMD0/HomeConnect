import React, { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useUpdateDebt } from '../hooks/useFinancialMutations';
import { UpdateDebtFormValues, updateDebtSchema } from '../schemas/financial-mutation.schemas';
import { DebtDetail } from '../types/customer-financial.types';
import { normalizeFinancialError } from '../utils/financial-form-errors';
import { formatMoney } from '../utils/financial-format';
import { inputClass, SubmitButton, TextField } from './CreateDebtForm';

interface EditDebtDialogProps {
  customerId: string;
  debt: DebtDetail;
  onSuccess: () => void;
}

export const EditDebtDialog: React.FC<EditDebtDialogProps> = ({
  customerId,
  debt,
  onSuccess,
}) => {
  const updateDebt = useUpdateDebt(customerId, debt.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<UpdateDebtFormValues>({
    resolver: zodResolver(updateDebtSchema),
    defaultValues: {
      originalAmount: debt.originalAmount,
      description: debt.description,
      dueDate: debt.dueDate,
      notes: debt.notes ?? '',
      reason: '',
      accountPassword: '',
    },
  });

  const onSubmit = async (values: UpdateDebtFormValues) => {
    setServerError(null);
    try {
      await updateDebt.mutateAsync({
        originalAmount: values.originalAmount.trim(),
        description: values.description.trim(),
        dueDate: values.dueDate,
        notes: values.notes?.trim() || null,
        reason: values.reason.trim(),
        sourceScreen: 'CUSTOMER_PROFILE',
        accountPassword: values.accountPassword,
      });
      onSuccess();
    } catch (error) {
      const normalized = normalizeFinancialError(error);
      setServerError(normalized.message);
      if (normalized.fieldErrors.description) {
        setError('description', { message: normalized.fieldErrors.description });
      }
      if (normalized.fieldErrors.originalAmount) {
        setError('originalAmount', { message: normalized.fieldErrors.originalAmount });
      }
      if (normalized.fieldErrors.dueDate) {
        setError('dueDate', { message: normalized.fieldErrors.dueDate });
      }
      if (normalized.fieldErrors.notes) {
        setError('notes', { message: normalized.fieldErrors.notes });
      }
      if (normalized.fieldErrors.accountPassword) {
        setError('accountPassword', { message: normalized.fieldErrors.accountPassword });
      }
      if (normalized.fieldErrors.reason) {
        setError('reason', { message: normalized.fieldErrors.reason });
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="user-text font-semibold text-slate-900" dir="auto">{debt.description}</p>
        <p className="mt-1">
          Original {formatMoney(debt.originalAmount)} · Paid {formatMoney(debt.totalPaid)} · Remaining{' '}
          {formatMoney(debt.remainingBalance)}
        </p>
      </div>

      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {serverError}
        </div>
      )}

      <TextField label="Corrected amount" error={errors.originalAmount?.message}>
        <input
          {...register('originalAmount')}
          inputMode="decimal"
          className={inputClass(Boolean(errors.originalAmount))}
        />
      </TextField>

      <TextField label="Description" error={errors.description?.message}>
        <input
          {...register('description')}
          dir="auto"
          className={inputClass(Boolean(errors.description))}
        />
      </TextField>

      <TextField label="Due date" error={errors.dueDate?.message}>
        <input
          {...register('dueDate')}
          type="date"
          className={inputClass(Boolean(errors.dueDate))}
        />
      </TextField>

      <TextField label="Notes" error={errors.notes?.message}>
        <textarea
          {...register('notes')}
          dir="auto"
          rows={3}
          className={inputClass(Boolean(errors.notes))}
          placeholder="Optional"
        />
      </TextField>

      <TextField label="Correction reason" error={errors.reason?.message}>
        <textarea
          {...register('reason')}
          dir="auto"
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
        isPending={updateDebt.isPending}
        label="Save changes"
        pendingLabel="Saving changes..."
      />
    </form>
  );
};
