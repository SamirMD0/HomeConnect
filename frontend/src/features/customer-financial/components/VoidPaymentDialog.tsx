import React, { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useVoidPayment } from '../hooks/useFinancialMutations';
import { VoidPaymentFormValues, voidPaymentSchema } from '../schemas/financial-mutation.schemas';
import {
  FinancialCorrectionSourceScreen,
  RecentFinancialPayment,
} from '../types/customer-financial.types';
import { normalizeFinancialError } from '../utils/financial-form-errors';
import { formatBusinessDate, formatMoney } from '../utils/financial-format';
import { paymentMethodLabels } from '../utils/financial-labels';
import { inputClass, SubmitButton, TextField } from './CreateDebtForm';

interface VoidPaymentDialogProps {
  customerId: string;
  payment: Pick<
    RecentFinancialPayment,
    'id' | 'totalAmount' | 'paymentDate' | 'paymentMethod' | 'reference'
  >;
  sourceScreen: FinancialCorrectionSourceScreen;
  onSuccess: () => void;
}

export const VoidPaymentDialog: React.FC<VoidPaymentDialogProps> = ({
  customerId,
  payment,
  sourceScreen,
  onSuccess,
}) => {
  const voidPayment = useVoidPayment(customerId, payment.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<VoidPaymentFormValues>({
    resolver: zodResolver(voidPaymentSchema),
    defaultValues: {
      reason: '',
      accountPassword: '',
    },
  });

  const onSubmit = async (values: VoidPaymentFormValues) => {
    setServerError(null);
    try {
      await voidPayment.mutateAsync({
        reason: values.reason.trim(),
        sourceScreen,
        accountPassword: values.accountPassword,
      });
      onSuccess();
    } catch (error) {
      const normalized = normalizeFinancialError(error);
      setServerError(normalized.message);
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
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">This will void the payment and remove its allocations from balances.</p>
        <p className="mt-1">
          {formatMoney(payment.totalAmount)} · {formatBusinessDate(payment.paymentDate)} ·{' '}
          {paymentMethodLabels[payment.paymentMethod]}
          {payment.reference ? ` · ${payment.reference}` : ''}
        </p>
      </div>

      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {serverError}
        </div>
      )}

      <TextField label="Void reason" error={errors.reason?.message}>
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
        isPending={voidPayment.isPending}
        label="Void payment"
        pendingLabel="Voiding payment..."
      />
    </form>
  );
};
