import React, { useState } from 'react';
import { PrepaidPurchase } from '../types/prepaid.types';
import { useConvertPrepaidPurchase } from '../hooks/usePrepaidMutations';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import { normalizeFinancialError } from '../../customer-financial/utils/financial-form-errors';
import { TextField, SubmitButton, inputClass } from '../../customer-financial/components/CreateDebtForm';
import { cn } from '../../../lib/cn';

type Mode = 'DEBT' | 'INSTALLMENT';

const MODES: Array<{ id: Mode; title: string; hint: string }> = [
  { id: 'DEBT', title: 'One debt', hint: 'The full remainder is due on one date.' },
  { id: 'INSTALLMENT', title: 'Installments', hint: 'The remainder is split across a schedule.' },
];

interface ConvertPrepaidDialogProps {
  item: PrepaidPurchase;
  onSuccess: () => void;
}

/**
 * Hands the item over and turns its unpaid remainder into a debt or an
 * installment plan. What the customer already paid stays counted.
 */
export const ConvertPrepaidDialog: React.FC<ConvertPrepaidDialogProps> = ({ item, onSuccess }) => {
  const convert = useConvertPrepaidPurchase(item.id);
  const [mode, setMode] = useState<Mode>('DEBT');
  const [date, setDate] = useState('');
  const [installmentCount, setInstallmentCount] = useState('3');
  const [frequency, setFrequency] = useState<'MONTHLY' | 'WEEKLY'>('MONTHLY');
  const [errors, setErrors] = useState<{ date?: string; installmentCount?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setServerError(null);
    const count = Number(installmentCount);
    const nextErrors: typeof errors = {};
    if (!date) nextErrors.date = mode === 'DEBT' ? 'Choose the due date' : 'Choose the first installment date';
    if (mode === 'INSTALLMENT' && (!Number.isInteger(count) || count < 1 || count > 120)) {
      nextErrors.installmentCount = 'Enter a whole number from 1 to 120';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      await convert.mutateAsync(
        mode === 'DEBT'
          ? { mode, dueDate: date }
          : { mode, startDate: date, installmentCount: count, frequency }
      );
      onSuccess();
    } catch (error) {
      setServerError(normalizeFinancialError(error).message);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <p className="user-text font-semibold text-slate-900" dir="auto">{item.itemName}</p>
        <p className="user-text text-slate-600" dir="auto">{item.customer.name}</p>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt className="text-slate-500">Full price</dt>
            <dd className="tabular-nums">{formatMoney(item.fullAmount)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Paid</dt>
            <dd className="tabular-nums">{formatMoney(item.amountPaid)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Remaining</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(item.remainingToCollect)}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        This marks the item as handed over. {formatMoney(item.remainingToCollect)} becomes owed and appears in
        Accounts Receivable. It can be undone until a payment is recorded against it.
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Convert the remainder to</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {MODES.map((option) => (
            <label
              key={option.id}
              className={cn(
                'cursor-pointer rounded-lg border p-3 transition-colors',
                mode === option.id ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:bg-slate-50'
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <input
                  type="radio"
                  name="convert-mode"
                  checked={mode === option.id}
                  onChange={() => setMode(option.id)}
                />
                {option.title}
              </span>
              <span className="mt-1 block text-xs text-slate-600">{option.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <TextField label={mode === 'DEBT' ? 'Due date' : 'First installment date'} error={errors.date}>
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className={inputClass(Boolean(errors.date))}
        />
      </TextField>

      {mode === 'INSTALLMENT' && (
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Number of installments" error={errors.installmentCount}>
            <input
              type="number"
              min={1}
              max={120}
              value={installmentCount}
              onChange={(event) => setInstallmentCount(event.target.value)}
              className={inputClass(Boolean(errors.installmentCount))}
            />
          </TextField>
          <TextField label="Frequency">
            <select
              value={frequency}
              onChange={(event) => setFrequency(event.target.value as 'MONTHLY' | 'WEEKLY')}
              className={inputClass(false)}
            >
              <option value="MONTHLY">Monthly</option>
              <option value="WEEKLY">Weekly</option>
            </select>
          </TextField>
        </div>
      )}

      {serverError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <SubmitButton isPending={convert.isPending} label="Convert and hand over" pendingLabel="Saving…" />
    </form>
  );
};
