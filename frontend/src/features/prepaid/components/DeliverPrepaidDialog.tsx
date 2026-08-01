import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PrepaidPurchase } from '../types/prepaid.types';
import { useDeliverPrepaidPurchase } from '../hooks/usePrepaidMutations';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import { normalizeFinancialError } from '../../customer-financial/utils/financial-form-errors';
import { businessLabels } from '../../../shared/labels/business-labels';
import { TextField, SubmitButton, inputClass } from '../../customer-financial/components/CreateDebtForm';

const deliverSchema = z.object({
  remainderDueDate: z.string().optional(),
  deliveryNotes: z.string().max(1000).optional(),
});

type DeliverFormValues = z.infer<typeof deliverSchema>;

interface DeliverPrepaidDialogProps {
  item: PrepaidPurchase;
  onSuccess: () => void;
}

export const DeliverPrepaidDialog: React.FC<DeliverPrepaidDialogProps> = ({ item, onSuccess }) => {
  const [serverError, setServerError] = useState<string | null>(null);
  const deliver = useDeliverPrepaidPurchase(item.id);
  const hasRemainder = !item.isFullyPaid;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<DeliverFormValues>({
    resolver: zodResolver(deliverSchema),
    defaultValues: { remainderDueDate: '', deliveryNotes: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    if (hasRemainder && !values.remainderDueDate) {
      setError('remainderDueDate', {
        message: 'A due date is required for the remaining balance',
      });
      return;
    }
    try {
      await deliver.mutateAsync({
        remainderDueDate: hasRemainder ? values.remainderDueDate : null,
        deliveryNotes: values.deliveryNotes?.trim() || null,
      });
      onSuccess();
    } catch (error) {
      const normalized = normalizeFinancialError(error);
      setServerError(normalized.message);
      Object.entries(normalized.fieldErrors ?? {}).forEach(([field, message]) => {
        setError(field as keyof DeliverFormValues, { message });
      });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <p className="user-text font-semibold text-slate-900" dir="auto">
          {item.itemName}
        </p>
        <p className="user-text text-slate-600" dir="auto">
          {item.customer.name}
        </p>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt className="text-slate-500">{businessLabels.prepaid.fullPrice}</dt>
            <dd className="tabular-nums">{formatMoney(item.fullAmount)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{businessLabels.prepaid.paid}</dt>
            <dd className="tabular-nums">{formatMoney(item.amountPaid)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{businessLabels.prepaid.remaining}</dt>
            <dd className="tabular-nums">{formatMoney(item.remainingToCollect)}</dd>
          </div>
        </dl>
      </div>

      {hasRemainder ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {formatMoney(item.remainingToCollect)} is still unpaid. Delivering will create a normal
          debt for that amount, which will then appear in Accounts Receivable and can become
          overdue.
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Fully paid. No debt will be created.
        </div>
      )}

      {serverError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {serverError}
        </div>
      )}

      {hasRemainder && (
        <TextField
          label={businessLabels.prepaid.remainderDueDate}
          error={errors.remainderDueDate?.message}
        >
          <input
            type="date"
            {...register('remainderDueDate')}
            className={inputClass(Boolean(errors.remainderDueDate))}
          />
        </TextField>
      )}

      <TextField label={businessLabels.prepaid.deliveryNotes} error={errors.deliveryNotes?.message}>
        <textarea
          rows={3}
          dir="auto"
          {...register('deliveryNotes')}
          className={inputClass(Boolean(errors.deliveryNotes))}
        />
      </TextField>

      <SubmitButton
        isPending={deliver.isPending}
        label={businessLabels.prepaid.markDelivered}
        pendingLabel="Saving…"
      />
    </form>
  );
};
