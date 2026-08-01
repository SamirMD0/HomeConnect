import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PrepaidPurchase } from '../types/prepaid.types';
import { useRevertPrepaidDelivery } from '../hooks/usePrepaidMutations';
import { normalizeFinancialError } from '../../customer-financial/utils/financial-form-errors';
import { businessLabels } from '../../../shared/labels/business-labels';
import { TextField, SubmitButton, inputClass } from '../../customer-financial/components/CreateDebtForm';

const revertSchema = z.object({
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters'),
  accountPassword: z.string().min(1, 'Account password is required'),
});

type RevertFormValues = z.infer<typeof revertSchema>;

interface RevertPrepaidDeliveryDialogProps {
  item: PrepaidPurchase;
  onSuccess: () => void;
}

export const RevertPrepaidDeliveryDialog: React.FC<RevertPrepaidDeliveryDialogProps> = ({
  item,
  onSuccess,
}) => {
  const [serverError, setServerError] = useState<string | null>(null);
  const revert = useRevertPrepaidDelivery(item.id);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RevertFormValues>({
    resolver: zodResolver(revertSchema),
    defaultValues: { reason: '', accountPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await revert.mutateAsync({
        reason: values.reason.trim(),
        accountPassword: values.accountPassword,
      });
      onSuccess();
    } catch (error) {
      const normalized = normalizeFinancialError(error);
      setServerError(normalized.message);
      Object.entries(normalized.fieldErrors ?? {}).forEach(([field, message]) => {
        setError(field as keyof RevertFormValues, { message });
      });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <p className="user-text font-semibold" dir="auto">
          {item.itemName}
        </p>
        <p className="mt-1">
          This reopens the prepaid purchase and cancels the debt created for the remaining balance.
          It is blocked if any payment has already been collected against that debt.
        </p>
      </div>

      {serverError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <TextField label={businessLabels.prepaid.reason} error={errors.reason?.message}>
        <textarea
          rows={3}
          dir="auto"
          {...register('reason')}
          className={inputClass(Boolean(errors.reason))}
        />
      </TextField>

      <TextField
        label={businessLabels.prepaid.accountPassword}
        error={errors.accountPassword?.message}
      >
        <input
          type="password"
          autoComplete="current-password"
          {...register('accountPassword')}
          className={inputClass(Boolean(errors.accountPassword))}
        />
      </TextField>

      <SubmitButton
        isPending={revert.isPending}
        label={businessLabels.prepaid.revertDelivery}
        pendingLabel="Saving…"
      />
    </form>
  );
};
