import React, { useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useRecordInstallmentPlanPayment } from '../hooks/useFinancialMutations';
import {
  InstallmentPlanPaymentFormValues,
  installmentPlanPaymentSchema,
} from '../schemas/financial-mutation.schemas';
import {
  InstallmentPlanStatus,
  InstallmentStatus,
} from '../types/customer-financial.types';
import { todayAsBusinessDate } from '../utils/business-date';
import { normalizeFinancialError } from '../utils/financial-form-errors';
import { formatBusinessDate, formatMoney } from '../utils/financial-format';
import { createClientIdempotencyKey } from '../utils/idempotency-key';
import { canonicalMoneyInput } from '../utils/money-input';
import { inputClass, SubmitButton, TextField } from './CreateDebtForm';
import { FinancialStatusBadge } from './FinancialStatusBadge';

interface RecordPlanPaymentDialogProps {
  customerId: string;
  plan: PlanPaymentTarget;
  onSuccess: () => void;
}

export interface PlanPaymentTarget {
  id: string;
  description: string;
  totalAmount: string;
  totalPaid: string;
  remainingBalance: string;
  nextDueDate: string | null;
  status?: InstallmentPlanStatus;
  calculatedStatus?: InstallmentPlanStatus;
  scheduleSummary?: {
    nextInstallment: {
      remainingAmount: string;
      status: InstallmentStatus;
    } | null;
  };
}

export const RecordPlanPaymentDialog: React.FC<RecordPlanPaymentDialogProps> = ({
  customerId,
  plan,
  onSuccess,
}) => {
  const idempotencyKeyRef = useRef(createClientIdempotencyKey('plan-payment'));
  const recordPayment = useRecordInstallmentPlanPayment(customerId, plan.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<InstallmentPlanPaymentFormValues>({
    resolver: zodResolver(installmentPlanPaymentSchema(plan.remainingBalance)),
    defaultValues: {
      amount: '',
      paymentDate: todayAsBusinessDate(),
      paymentMethod: 'CASH',
      reference: '',
      notes: '',
    },
  });
  const amount = watch('amount');

  const onSubmit = async (values: InstallmentPlanPaymentFormValues) => {
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
      idempotencyKeyRef.current = createClientIdempotencyKey('plan-payment');
      onSuccess();
    } catch (error) {
      const normalized = normalizeFinancialError(error);
      setServerError(normalized.message);
      applyPlanPaymentFieldErrors(normalized.fieldErrors, setError);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <PlanPaymentContext plan={plan} />
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        Payments are applied to the oldest unpaid installment first.
      </div>
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
          placeholder="150.00"
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
        <input {...register('reference')} className={inputClass(Boolean(errors.reference))} placeholder="Optional" />
      </TextField>
      <TextField label="Notes" error={errors.notes?.message}>
        <textarea {...register('notes')} rows={3} className={inputClass(Boolean(errors.notes))} placeholder="Optional" />
      </TextField>
      <SubmitButton
        isPending={recordPayment.isPending}
        label="Record payment"
        pendingLabel="Recording payment..."
      />
    </form>
  );
};

const PlanPaymentContext: React.FC<{ plan: PlanPaymentTarget }> = ({
  plan,
}) => (
  <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <p className="font-semibold text-slate-900">{plan.description}</p>
      <FinancialStatusBadge type="plan" status={plan.calculatedStatus ?? plan.status ?? 'ACTIVE'} />
    </div>
    <dl className="grid grid-cols-2 gap-3 text-slate-600 sm:grid-cols-4">
      <ContextTerm label="Total" value={formatMoney(plan.totalAmount)} />
      <ContextTerm label="Paid" value={formatMoney(plan.totalPaid)} />
      <ContextTerm label="Remaining" value={formatMoney(plan.remainingBalance)} />
      <ContextTerm label="Next due" value={formatBusinessDate(plan.nextDueDate)} />
      <ContextTerm
        label="Next amount"
        value={
          plan.scheduleSummary?.nextInstallment
            ? formatMoney(plan.scheduleSummary.nextInstallment.remainingAmount)
            : '$0.00'
        }
      />
    </dl>
  </div>
);

const ContextTerm: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-1 font-semibold text-slate-900">{value}</dd>
  </div>
);

function applyPlanPaymentFieldErrors(
  fieldErrors: Record<string, string>,
  setError: ReturnType<typeof useForm<InstallmentPlanPaymentFormValues>>['setError']
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
