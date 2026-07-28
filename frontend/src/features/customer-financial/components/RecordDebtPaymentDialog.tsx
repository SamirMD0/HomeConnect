import React, { useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useRecordDebtPayment } from '../hooks/useFinancialMutations';
import { DebtPaymentFormValues, debtPaymentSchema } from '../schemas/financial-mutation.schemas';
import { DebtStatus } from '../types/customer-financial.types';
import { todayAsBusinessDate } from '../utils/business-date';
import { normalizeFinancialError } from '../utils/financial-form-errors';
import { formatBusinessDate, formatMoney } from '../utils/financial-format';
import { createClientIdempotencyKey } from '../utils/idempotency-key';
import { canonicalMoneyInput } from '../utils/money-input';
import { inputClass, SubmitButton, TextField } from './CreateDebtForm';
import { FinancialStatusBadge } from './FinancialStatusBadge';

interface RecordDebtPaymentDialogProps {
  customerId: string;
  debt: DebtPaymentTarget;
  onSuccess: () => void;
}

export interface DebtPaymentTarget {
  id: string;
  description: string;
  originalAmount: string;
  totalPaid: string;
  remainingBalance: string;
  dueDate: string;
  status?: DebtStatus;
  calculatedStatus?: DebtStatus;
}

export const RecordDebtPaymentDialog: React.FC<RecordDebtPaymentDialogProps> = ({
  customerId,
  debt,
  onSuccess,
}) => {
  const idempotencyKeyRef = useRef(createClientIdempotencyKey('debt-payment'));
  const recordPayment = useRecordDebtPayment(customerId, debt.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<DebtPaymentFormValues>({
    resolver: zodResolver(debtPaymentSchema(debt.remainingBalance)),
    defaultValues: {
      amount: '',
      paymentDate: todayAsBusinessDate(),
      paymentMethod: 'CASH',
      reference: '',
      notes: '',
    },
  });
  const amount = watch('amount');

  const onSubmit = async (values: DebtPaymentFormValues) => {
    setServerError(null);
    try {
      await recordPayment.mutateAsync({
        amount: canonicalMoneyInput(values.amount),
        paymentDate: values.paymentDate,
        paymentMethod: values.paymentMethod,
        reference: values.reference?.trim() || null,
        notes: values.notes?.trim() || null,
        idempotencyKey: idempotencyKeyRef.current,
      });
      idempotencyKeyRef.current = createClientIdempotencyKey('debt-payment');
      onSuccess();
    } catch (error) {
      const normalized = normalizeFinancialError(error);
      setServerError(normalized.message);
      applyPaymentFieldErrors(normalized.fieldErrors, setError);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <DebtPaymentContext debt={debt} />
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
          placeholder="200.00"
        />
      </TextField>
      <TextField label="Payment date" error={errors.paymentDate?.message}>
        <input {...register('paymentDate')} type="date" className={inputClass(Boolean(errors.paymentDate))} />
      </TextField>
      <TextField label="Payment method" error={errors.paymentMethod?.message}>
        <select {...register('paymentMethod')} className={inputClass(Boolean(errors.paymentMethod))}>
          <option value="CASH">Cash</option>
          <option value="CARD">Card</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="CHECK">Check</option>
          <option value="OTHER">Other</option>
        </select>
      </TextField>
      <TextField label="Reference" error={errors.reference?.message}>
        <input {...register('reference')} dir="auto" className={inputClass(Boolean(errors.reference))} placeholder="Optional" />
      </TextField>
      <TextField label="Notes" error={errors.notes?.message}>
        <textarea {...register('notes')} dir="auto" rows={3} className={inputClass(Boolean(errors.notes))} placeholder="Optional" />
      </TextField>
      <SubmitButton
        isPending={recordPayment.isPending}
        label="Record payment"
        pendingLabel="Recording payment..."
      />
    </form>
  );
};

const DebtPaymentContext: React.FC<{ debt: DebtPaymentTarget }> = ({ debt }) => (
  <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <p className="user-text font-semibold text-slate-900" dir="auto">{debt.description}</p>
      <FinancialStatusBadge type="debt" status={debt.calculatedStatus ?? debt.status ?? 'UNPAID'} />
    </div>
    <dl className="grid grid-cols-2 gap-3 text-slate-600 sm:grid-cols-4">
      <ContextTerm label="Original" value={formatMoney(debt.originalAmount)} />
      <ContextTerm label="Paid" value={formatMoney(debt.totalPaid)} />
      <ContextTerm label="Remaining" value={formatMoney(debt.remainingBalance)} />
      <ContextTerm label="Due" value={formatBusinessDate(debt.dueDate)} />
    </dl>
  </div>
);

const ContextTerm: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-1 font-semibold text-slate-900">{value}</dd>
  </div>
);

function applyPaymentFieldErrors(
  fieldErrors: Record<string, string>,
  setError: ReturnType<typeof useForm<DebtPaymentFormValues>>['setError']
) {
  for (const [field, message] of Object.entries(fieldErrors)) {
    if (
      field === 'amount' ||
      field === 'paymentDate' ||
      field === 'paymentMethod' ||
      field === 'reference' ||
      field === 'notes'
    ) {
      setError(field, { message });
    }
  }
}
