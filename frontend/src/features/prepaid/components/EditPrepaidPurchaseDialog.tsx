import React, { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useUpdateDebt } from '../../customer-financial/hooks/useFinancialMutations';
import {
  UpdateDebtFormValues,
  updateDebtSchema,
} from '../../customer-financial/schemas/financial-mutation.schemas';
import { normalizeFinancialError } from '../../customer-financial/utils/financial-form-errors';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import {
  canonicalMoneyInput,
  isMoneyLessThanOrEqual,
} from '../../customer-financial/utils/money-input';
import {
  inputClass,
  SubmitButton,
  TextField,
} from '../../customer-financial/components/CreateDebtForm';
import { PrepaidPurchase } from '../types/prepaid.types';
import { businessLabels } from '../../../shared/labels/business-labels';

interface EditPrepaidPurchaseDialogProps {
  item: PrepaidPurchase;
  onSuccess: () => void;
}

const buildEditSchema = (amountPaid: string) =>
  updateDebtSchema.superRefine((value, context) => {
    if (!isMoneyLessThanOrEqual(amountPaid, value.originalAmount)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['originalAmount'],
        message: 'Full price cannot be less than the amount already paid',
      });
    }
  });

export const EditPrepaidPurchaseDialog: React.FC<EditPrepaidPurchaseDialogProps> = ({
  item,
  onSuccess,
}) => {
  const updateDebt = useUpdateDebt(item.customer.id, item.debtId);
  const [serverError, setServerError] = useState<string | null>(null);
  const schema = useMemo(() => buildEditSchema(item.amountPaid), [item.amountPaid]);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<UpdateDebtFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      originalAmount: item.fullAmount,
      description: item.itemName,
      dueDate: item.dueDate,
      notes: item.notes ?? '',
      reason: '',
      accountPassword: '',
    },
  });
  const fullAmount = watch('originalAmount');

  const onSubmit = async (values: UpdateDebtFormValues) => {
    setServerError(null);
    try {
      await updateDebt.mutateAsync({
        originalAmount: canonicalMoneyInput(values.originalAmount),
        description: values.description.trim(),
        dueDate: item.dueDate,
        notes: values.notes?.trim() || null,
        reason: values.reason.trim(),
        sourceScreen: 'PREPAID',
        accountPassword: values.accountPassword,
      });
      onSuccess();
    } catch (error) {
      const normalized = normalizeFinancialError(error);
      setServerError(normalized.message);
      for (const field of [
        'originalAmount',
        'description',
        'notes',
        'reason',
        'accountPassword',
      ] as const) {
        if (normalized.fieldErrors[field]) {
          setError(field, { message: normalized.fieldErrors[field] });
        }
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="user-text font-semibold text-slate-900" dir="auto">
          {item.customer.name}
        </p>
        <p className="mt-1">
          {businessLabels.prepaid.paid} {formatMoney(item.amountPaid)} ·{' '}
          {businessLabels.prepaid.remaining} {formatMoney(item.remainingToCollect)}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Recorded payments are preserved. Use payment correction tools to change payment history.
        </p>
      </div>

      {serverError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <input type="hidden" {...register('dueDate')} />

      <TextField label={businessLabels.prepaid.item} error={errors.description?.message}>
        <input {...register('description')} dir="auto" className={inputClass(Boolean(errors.description))} />
      </TextField>

      <TextField label={businessLabels.prepaid.fullPrice} error={errors.originalAmount?.message}>
        <input
          {...register('originalAmount')}
          inputMode="decimal"
          onBlur={() =>
            setValue('originalAmount', canonicalMoneyInput(fullAmount), { shouldValidate: true })
          }
          className={inputClass(Boolean(errors.originalAmount))}
        />
      </TextField>

      <TextField label={businessLabels.common.notes} error={errors.notes?.message}>
        <textarea {...register('notes')} dir="auto" rows={3} className={inputClass(Boolean(errors.notes))} />
      </TextField>

      <TextField label="Correction Reason / سبب التعديل" error={errors.reason?.message}>
        <textarea {...register('reason')} dir="auto" rows={3} className={inputClass(Boolean(errors.reason))} />
      </TextField>

      <TextField label={businessLabels.prepaid.accountPassword} error={errors.accountPassword?.message}>
        <input
          {...register('accountPassword')}
          type="password"
          autoComplete="current-password"
          className={inputClass(Boolean(errors.accountPassword))}
        />
      </TextField>

      <SubmitButton
        isPending={updateDebt.isPending}
        label={businessLabels.common.saveChanges}
        pendingLabel="Saving changes... / جارٍ حفظ التعديلات..."
      />
    </form>
  );
};
