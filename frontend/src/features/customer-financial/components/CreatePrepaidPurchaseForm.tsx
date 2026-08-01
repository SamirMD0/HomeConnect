import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { businessLabels } from '../../../shared/labels/business-labels';
import { useCreatePrepaidPurchase } from '../hooks/useFinancialMutations';
import {
  CreatePrepaidPurchaseFormValues,
  createPrepaidPurchaseSchema,
} from '../schemas/financial-mutation.schemas';
import { FinancialSummaryCustomer } from '../types/customer-financial.types';
import { normalizeFinancialError } from '../utils/financial-form-errors';
import { formatMoney } from '../utils/financial-format';
import { canonicalMoneyInput, negativeMoneyInput, subtractMoneyInput } from '../utils/money-input';
import { CustomerContext, inputClass, SubmitButton, TextField } from './CreateDebtForm';

interface CreatePrepaidPurchaseFormProps {
  customer: FinancialSummaryCustomer;
  onBack: () => void;
  onSuccess: () => void;
}

export const CreatePrepaidPurchaseForm: React.FC<CreatePrepaidPurchaseFormProps> = ({
  customer,
  onBack,
  onSuccess,
}) => {
  const createPrepaidPurchase = useCreatePrepaidPurchase(customer.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<CreatePrepaidPurchaseFormValues>({
    resolver: zodResolver(createPrepaidPurchaseSchema),
    defaultValues: { itemName: '', paymentAmount: '', fullAmount: '', notes: '' },
  });

  const paymentAmount = watch('paymentAmount');
  const fullAmount = watch('fullAmount');
  const remainingAmount = subtractMoneyInput(fullAmount, paymentAmount);

  const onSubmit = async (values: CreatePrepaidPurchaseFormValues) => {
    setServerError(null);
    try {
      await createPrepaidPurchase.mutateAsync({
        itemName: values.itemName.trim(),
        paymentAmount: canonicalMoneyInput(values.paymentAmount),
        fullAmount: canonicalMoneyInput(values.fullAmount),
        notes: values.notes?.trim() || null,
      });
      onSuccess();
    } catch (error) {
      const normalized = normalizeFinancialError(error);
      setServerError(normalized.message);
      for (const [field, message] of Object.entries(normalized.fieldErrors)) {
        if (field === 'itemName' || field === 'paymentAmount' || field === 'fullAmount' || field === 'notes') {
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

      <div>
        <h3 className="text-lg font-semibold text-slate-900">{businessLabels.financial.prepaidPurchase}</h3>
        <p className="mt-1 text-sm text-slate-500">The item stays reserved while the customer pays the remaining balance / تبقى السلعة محجوزة حتى دفع المبلغ المتبقي.</p>
      </div>

      {serverError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{serverError}</div>}

      <TextField label={businessLabels.financial.itemName} error={errors.itemName?.message}>
        <input {...register('itemName')} dir="auto" className={inputClass(Boolean(errors.itemName))} placeholder="Air conditioner / مكيف" />
      </TextField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label={businessLabels.financial.fullAmount} error={errors.fullAmount?.message}>
          <input
            {...register('fullAmount')}
            inputMode="decimal"
            onBlur={() => setValue('fullAmount', canonicalMoneyInput(fullAmount), { shouldValidate: true })}
            className={inputClass(Boolean(errors.fullAmount))}
            placeholder="400.00"
          />
        </TextField>

        <TextField label={businessLabels.financial.initialPayment} error={errors.paymentAmount?.message}>
          <input
            {...register('paymentAmount')}
            inputMode="decimal"
            onBlur={() => setValue('paymentAmount', canonicalMoneyInput(paymentAmount), { shouldValidate: true })}
            className={inputClass(Boolean(errors.paymentAmount))}
            placeholder="100.00"
          />
        </TextField>
      </div>

      <TextField label="Admin debt after payment / دين على الإدارة بعد الدفعة">
        <output className="block w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold tabular-nums text-red-700">
          {remainingAmount === null ? '—' : formatMoney(negativeMoneyInput(remainingAmount))}
        </output>
      </TextField>

      <TextField label={businessLabels.common.notes} error={errors.notes?.message}>
        <textarea {...register('notes')} dir="auto" rows={3} className={inputClass(Boolean(errors.notes))} placeholder="Optional / اختياري" />
      </TextField>

      <SubmitButton
        isPending={createPrepaidPurchase.isPending}
        label="Save Prepaid Purchase / حفظ الشراء المسبق"
        pendingLabel="Saving... / جارٍ الحفظ..."
      />
    </form>
  );
};
