import React, { useEffect, useMemo, useState } from 'react';
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
import { businessLabels } from '../../../shared/labels/business-labels';

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
  const [scheduleMode, setScheduleMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [manualAmounts, setManualAmounts] = useState<string[]>([]);
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
  const installmentCount = Number(values.installmentCount);

  const previewResult = useMemo(() => {
    try {
      return {
        preview: generateInstallmentPreview({
          totalAmount: values.totalAmount || '',
          startDate: values.startDate || '',
          installmentCount,
          manualAmounts: scheduleMode === 'MANUAL' ? manualAmounts : undefined,
        }),
        error: null,
      };
    } catch (error) {
      return { preview: null, error: error instanceof Error ? error.message : 'Preview unavailable.' };
    }
  }, [installmentCount, manualAmounts, scheduleMode, values.startDate, values.totalAmount]);

  useEffect(() => {
    if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 120) {
      return;
    }

    setManualAmounts((current) =>
      Array.from({ length: installmentCount }, (_, index) => current[index] ?? '')
    );
  }, [installmentCount]);

  const onSubmit = async (formValues: CreateInstallmentPlanFormValues) => {
    setServerError(null);
    if (!previewResult.preview) {
      setServerError(previewResult.error || 'Preview must be valid before creating the plan.');
      return;
    }
    if (scheduleMode === 'MANUAL' && !previewResult.preview.isBalanced) {
      setServerError('Manual schedule total must match the installment plan total.');
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
        schedule:
          scheduleMode === 'MANUAL'
            ? previewResult.preview.rows.map((row) => ({ amountDue: row.amountDue }))
            : undefined,
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
        Back / رجوع
      </button>

      <CustomerContext customer={customer} />

      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {serverError}
        </div>
      )}

      <TextField label="Total Amount / المبلغ الإجمالي" error={errors.totalAmount?.message}>
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

      <TextField label={businessLabels.financial.description} error={errors.description?.message}>
        <input {...register('description')} dir="auto" className={inputClass(Boolean(errors.description))} placeholder="Refrigerator" />
      </TextField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Start Date / تاريخ البدء" error={errors.startDate?.message}>
          <input {...register('startDate')} type="date" className={inputClass(Boolean(errors.startDate))} />
        </TextField>
        <TextField label="Number of Installments / عدد الأقساط" error={errors.installmentCount?.message}>
          <input
            {...register('installmentCount', { valueAsNumber: true })}
            type="number"
            min="1"
            step="1"
            className={inputClass(Boolean(errors.installmentCount))}
          />
        </TextField>
      </div>

      <TextField label="Frequency / التكرار" error={errors.frequency?.message}>
        <select {...register('frequency')} className={inputClass(Boolean(errors.frequency))}>
          <option value="MONTHLY">Monthly / شهري</option>
        </select>
      </TextField>

      <TextField label={businessLabels.common.notes} error={errors.notes?.message}>
        <textarea {...register('notes')} dir="auto" rows={3} className={inputClass(Boolean(errors.notes))} placeholder="Optional" />
      </TextField>

      <div className="space-y-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setScheduleMode('AUTO')}
            className={scheduleModeClass(scheduleMode === 'AUTO')}
          >
            Auto / تلقائي
          </button>
          <button
            type="button"
            onClick={() => {
              if (previewResult.preview?.rows.length === installmentCount) {
                setManualAmounts(previewResult.preview.rows.map((row) => row.amountDue));
              }
              setScheduleMode('MANUAL');
            }}
            className={scheduleModeClass(scheduleMode === 'MANUAL')}
          >
            Manual / يدوي
          </button>
        </div>

        {scheduleMode === 'MANUAL' && (
          <div className="rounded-lg border border-slate-200">
            <div className="grid grid-cols-[72px_minmax(0,1fr)] border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <span>#</span>
              <span>{businessLabels.financial.amount}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {manualAmounts.map((amount, index) => (
                <label key={index} className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-700">{index + 1}</span>
                  <input
                    value={amount}
                    inputMode="decimal"
                    onChange={(event) => {
                      const nextAmounts = [...manualAmounts];
                      nextAmounts[index] = event.target.value;
                      setManualAmounts(nextAmounts);
                    }}
                    onBlur={() => {
                      const nextAmounts = [...manualAmounts];
                      nextAmounts[index] = canonicalMoneyInput(nextAmounts[index] ?? '');
                      setManualAmounts(nextAmounts);
                    }}
                    className={inputClass(false)}
                    placeholder="0.00"
                  />
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <InstallmentSchedulePreview preview={previewResult.preview} error={previewResult.error} />

      <SubmitButton
        isPending={createPlan.isPending}
        label="Create Installment Plan / إنشاء خطة تقسيط"
        pendingLabel="Creating plan... / جارٍ إنشاء الخطة..."
      />
    </form>
  );
};

function scheduleModeClass(active: boolean): string {
  return active
    ? 'rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-emerald-700 shadow-sm'
    : 'rounded-md px-3 py-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900';
}
