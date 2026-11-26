import React, { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useCorrectPayment } from '../hooks/useFinancialMutations';
import { EditPaymentFormValues, editPaymentSchema } from '../schemas/financial-mutation.schemas';
import {
  FinancialCorrectionSourceScreen,
  RecentFinancialPayment,
} from '../types/customer-financial.types';
import { normalizeFinancialError } from '../utils/financial-form-errors';
import { canonicalMoneyInput } from '../utils/money-input';
import { paymentMethodLabels } from '../utils/financial-labels';
import { inputClass, SubmitButton, TextField } from './CreateDebtForm';
import { businessLabels, englishLabel } from '../../../shared/labels/business-labels';

interface EditPaymentDialogProps {
  customerId: string;
  payment: Pick<
    RecentFinancialPayment,
    'id' | 'totalAmount' | 'paymentDate' | 'paymentMethod' | 'reference' | 'notes'
  >;
  sourceScreen: FinancialCorrectionSourceScreen;
  onSuccess: () => void;
}

/**
 * Admin edit of a receipt: amount, date, method, reference and notes. Saved
 * straight away (no password, no reason); the audit log still records who
 * changed what. A new amount re-issues the receipt and moves it to the same
 * invoice, so the invoice balance follows.
 */
export const EditPaymentDialog: React.FC<EditPaymentDialogProps> = ({
  customerId,
  payment,
  sourceScreen,
  onSuccess,
}) => {
  const correctPayment = useCorrectPayment(customerId, payment.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<EditPaymentFormValues>({
    resolver: zodResolver(editPaymentSchema),
    defaultValues: {
      amount: payment.totalAmount,
      paymentDate: payment.paymentDate,
      paymentMethod: payment.paymentMethod,
      reference: payment.reference ?? '',
      notes: payment.notes ?? '',
    },
  });
  const amount = watch('amount');

  const onSubmit = async (values: EditPaymentFormValues) => {
    setServerError(null);
    try {
      await correctPayment.mutateAsync({
        amount: canonicalMoneyInput(values.amount),
        paymentDate: values.paymentDate,
        paymentMethod: values.paymentMethod,
        reference: values.reference?.trim() || null,
        notes: values.notes?.trim() || null,
        sourceScreen,
      });
      onSuccess();
    } catch (error) {
      const normalized = normalizeFinancialError(error);
      setServerError(normalized.message);
      for (const [field, message] of Object.entries(normalized.fieldErrors)) {
        if (field === 'amount' || field === 'paymentDate' || field === 'paymentMethod' || field === 'reference' || field === 'notes') {
          setError(field, { message });
        }
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {serverError}
        </div>
      )}
      <TextField label={englishLabel(businessLabels.financial.amount)} error={errors.amount?.message}>
        <input
          {...register('amount')}
          inputMode="decimal"
          onBlur={() => setValue('amount', canonicalMoneyInput(amount), { shouldValidate: true })}
          className={inputClass(Boolean(errors.amount))}
        />
      </TextField>
      <TextField label={englishLabel(businessLabels.financial.paymentDate)} error={errors.paymentDate?.message}>
        <input {...register('paymentDate')} type="date" className={inputClass(Boolean(errors.paymentDate))} />
      </TextField>
      <TextField label={englishLabel(businessLabels.financial.paymentMethod)} error={errors.paymentMethod?.message}>
        <select {...register('paymentMethod')} className={inputClass(Boolean(errors.paymentMethod))}>
          {Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </TextField>
      <TextField label={englishLabel(businessLabels.financial.reference)} error={errors.reference?.message}>
        <input {...register('reference')} dir="auto" className={inputClass(Boolean(errors.reference))} placeholder="Optional" />
      </TextField>
      <TextField label={englishLabel(businessLabels.common.notes)} error={errors.notes?.message}>
        <textarea {...register('notes')} dir="auto" rows={3} className={inputClass(Boolean(errors.notes))} placeholder="Optional" />
      </TextField>
      <SubmitButton isPending={correctPayment.isPending} label="Save changes" pendingLabel="Saving changes..." />
    </form>
  );
};
