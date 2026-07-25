import React, { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { ArrowLeft } from 'lucide-react';
import { useCreateInstallmentPlan } from '../hooks/useFinancialMutations';
import {
  CreateInstallmentPlanFormValues,
  createInstallmentPlanSchema,
} from '../schemas/financial-mutation.schemas';
import { FinancialSummaryCustomer } from '../types/customer-financial.types';
import { normalizeFinancialError } from '../utils/financial-form-errors';
import { generateInstallmentPreview } from '../utils/installment-preview';
import { canonicalMoneyInput } from '../utils/money-input';
import { CustomerContext, inputClass, SubmitButton, TextField } from './CreateDebtForm';
import { InstallmentSchedulePreview } from './InstallmentSchedulePreview';

interface CreateInstallmentPlanFormProps {
  customer: FinancialSummaryCustomer;
  onBack: () => void;
  onSuccess: () => void;
}

export const CreateInstallmentPlanForm: React.FC<CreateInstallmentPlanFormProps> = ({
  customer,
  onBack,
  onSuccess,
}) => {
  const createPlan = useCreateInstallmentPlan(customer.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<CreateInstallmentPlanFormValues>({
    resolver: zodResolver(createInstallmentPlanSchema),
    defaultValues: {
      totalAmount: '',
      description: '',
      startDate: '',
      installmentCount: 6,
      frequency: 'MONTHLY',
      notes: '',
    },
  });

  const values = watch();
  const previewResult = useMemo(() => {
    try {
      return {
        preview: generateInstallmentPreview({
          totalAmount: values.totalAmount || '',
          startDate: values.startDate || '',
          installmentCount: Number(values.installmentCount),
        }),
        error: null,
      };
    } catch (error) {
      return { preview: null, error: error instanceof Error ? error.message : 'Preview unavailable.' };
    }
  }, [values.installmentCount, values.startDate, values.totalAmount]);

  const onSubmit = async (formValues: CreateInstallmentPlanFormValues) => {
    setServerError(null);
    if (!previewResult.preview) {
      setServerError(previewResult.error || 'Preview must be valid before creating the plan.');
      return;
    }

    try {
      await createPlan.mutateAsync({
        totalAmount: canonicalMoneyInput(formValues.totalAmount),
        description: formValues.description.trim(),
        startDate: formValues.startDate,
        installmentCount: formValues.installmentCount,
        frequency: 'MONTHLY',
        notes: formValues.notes?.trim() || null,
      });
      onSuccess();
    } catch (error) {
      const normalized = normalizeFinancialError(error);
      setServerError(normalized.message);
      for (const [field, message] of Object.entries(normalized.fieldErrors)) {
        if (
          field === 'totalAmount' ||
          field === 'description' ||
          field === 'startDate' ||
          field === 'installmentCount' ||
          field === 'frequency' ||
          field === 'notes'
        ) {
          setError(field, { message });
        }
      }
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

      <TextField label="Total amount" error={errors.totalAmount?.message}>
        <input
          {...register('totalAmount')}
          inputMode="decimal"
          onBlur={() =>
            setValue('totalAmount', canonicalMoneyInput(values.totalAmount), { shouldValidate: true })
          }
          className={inputClass(Boolean(errors.totalAmount))}
          placeholder="600.00"
        />
      </TextField>

      <TextField label="Description" error={errors.description?.message}>
        <input {...register('description')} className={inputClass(Boolean(errors.description))} placeholder="Refrigerator" />
      </TextField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Start date" error={errors.startDate?.message}>
          <input {...register('startDate')} type="date" className={inputClass(Boolean(errors.startDate))} />
        </TextField>
        <TextField label="Number of installments" error={errors.installmentCount?.message}>
          <input
            {...register('installmentCount', { valueAsNumber: true })}
            type="number"
            min="1"
            step="1"
            className={inputClass(Boolean(errors.installmentCount))}
          />
        </TextField>
      </div>

      <TextField label="Frequency" error={errors.frequency?.message}>
        <select {...register('frequency')} className={inputClass(Boolean(errors.frequency))}>
          <option value="MONTHLY">Monthly</option>
        </select>
      </TextField>

      <TextField label="Notes" error={errors.notes?.message}>
        <textarea {...register('notes')} rows={3} className={inputClass(Boolean(errors.notes))} placeholder="Optional" />
      </TextField>

      <InstallmentSchedulePreview preview={previewResult.preview} error={previewResult.error} />

      <SubmitButton
        isPending={createPlan.isPending}
        label="Create installment plan"
        pendingLabel="Creating plan..."
      />
    </form>
  );
};
