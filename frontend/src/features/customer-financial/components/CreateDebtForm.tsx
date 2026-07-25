import React, { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useCreateDebt } from '../hooks/useFinancialMutations';
import { CreateDebtFormValues, createDebtSchema } from '../schemas/financial-mutation.schemas';
import { FinancialSummaryCustomer } from '../types/customer-financial.types';
import { normalizeFinancialError } from '../utils/financial-form-errors';
import { canonicalMoneyInput } from '../utils/money-input';

interface CreateDebtFormProps {
  customer: FinancialSummaryCustomer;
  onBack: () => void;
  onSuccess: () => void;
}

export const CreateDebtForm: React.FC<CreateDebtFormProps> = ({ customer, onBack, onSuccess }) => {
  const createDebt = useCreateDebt(customer.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<CreateDebtFormValues>({
    resolver: zodResolver(createDebtSchema),
    defaultValues: {
      amount: '',
      description: '',
      dueDate: '',
      notes: '',
    },
  });

  const amount = watch('amount');
  const description = watch('description');
  const dueDate = watch('dueDate');

  const onSubmit = async (values: CreateDebtFormValues) => {
    setServerError(null);
    try {
      await createDebt.mutateAsync({
        amount: canonicalMoneyInput(values.amount),
        description: values.description.trim(),
        dueDate: values.dueDate,
        notes: values.notes?.trim() || null,
      });
      onSuccess();
    } catch (error) {
      const normalized = normalizeFinancialError(error);
      setServerError(normalized.message);
      applyServerFieldErrors(normalized.fieldErrors, setError);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <CustomerContext customer={customer} />

      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {serverError}
        </div>
      )}

      <TextField label="Amount" error={errors.amount?.message}>
        <input
          {...register('amount')}
          inputMode="decimal"
          onBlur={() => setValue('amount', canonicalMoneyInput(amount), { shouldValidate: true })}
          className={inputClass(Boolean(errors.amount))}
          placeholder="600.00"
        />
      </TextField>

      <TextField label="Description" error={errors.description?.message}>
        <input {...register('description')} className={inputClass(Boolean(errors.description))} placeholder="Refrigerator" />
      </TextField>

      <TextField label="Exact due date" error={errors.dueDate?.message}>
        <input {...register('dueDate')} type="date" className={inputClass(Boolean(errors.dueDate))} />
      </TextField>

      <TextField label="Notes" error={errors.notes?.message}>
        <textarea {...register('notes')} rows={3} className={inputClass(Boolean(errors.notes))} placeholder="Optional" />
      </TextField>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        Review: {description.trim() || 'No description'} for {amount || '0.00'} due {dueDate || 'not set'}.
      </div>

      <SubmitButton isPending={createDebt.isPending} label="Create debt" pendingLabel="Creating debt..." />
    </form>
  );
};

export const CustomerContext: React.FC<{ customer: FinancialSummaryCustomer }> = ({ customer }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</p>
    <p className="mt-1 font-semibold text-slate-900">{customer.name}</p>
    <p className="text-sm text-slate-600">{customer.phone}</p>
  </div>
);

export const TextField: React.FC<{
  label: string;
  error?: string;
  children: React.ReactNode;
}> = ({ label, error, children }) => (
  <label className="block text-sm font-medium text-slate-700">
    {label}
    <span className="mt-1 block">{children}</span>
    {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
  </label>
);

export const SubmitButton: React.FC<{ isPending: boolean; label: string; pendingLabel: string }> = ({
  isPending,
  label,
  pendingLabel,
}) => (
  <button
    type="submit"
    disabled={isPending}
    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
  >
    {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
    {isPending ? pendingLabel : label}
  </button>
);

export function inputClass(hasError: boolean): string {
  return `block w-full rounded-lg border px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 ${
    hasError
      ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
      : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20'
  }`;
}

function applyServerFieldErrors(
  fieldErrors: Record<string, string>,
  setError: ReturnType<typeof useForm<CreateDebtFormValues>>['setError']
) {
  for (const [field, message] of Object.entries(fieldErrors)) {
    if (field === 'amount' || field === 'description' || field === 'dueDate' || field === 'notes') {
      setError(field, { message });
    }
  }
}
