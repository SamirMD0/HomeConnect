import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateTransaction } from '../hooks/useTransactions';
import { useAuth } from '../../../hooks/useAuth';

const transactionSchema = z.object({
  type: z.enum(['SALE', 'PAYMENT', 'ADJUSTMENT']),
  amount: z.number().positive('Amount must be positive'),
  description: z.string().min(1, 'Description is required'),
  date: z.string().optional().nullable(),
});

type TransactionFormData = z.infer<typeof transactionSchema>;

interface TransactionFormProps {
  customerId: string;
  defaultType?: 'SALE' | 'PAYMENT' | 'ADJUSTMENT';
  parentId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const TransactionForm: React.FC<TransactionFormProps> = ({ customerId, defaultType, parentId, onSuccess, onCancel }) => {
  const { user } = useAuth();
  const createTransaction = useCreateTransaction();
  const isAdmin = user?.role === 'ADMIN';

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: defaultType || 'SALE',
      amount: undefined,
      description: '',
    },
  });

  const selectedType = watch('type');

  const onSubmit = (data: TransactionFormData) => {
    createTransaction.mutate(
      {
        customerId,
        parentId: parentId || undefined,
        ...data,
        date: data.date ? new Date(data.date).toISOString() : undefined,
      },
      {
        onSuccess: () => {
          onSuccess();
        },
      }
    );
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {!defaultType && (
        <div>
          <label htmlFor="type" className="block text-sm font-medium leading-6 text-slate-900">
            Transaction Type
          </label>
          <div className="mt-2">
            <select
              id="type"
              {...register('type')}
              className="block w-full rounded-md border-0 py-1.5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
            >
              <option value="SALE">Sale (Increase Debt)</option>
              <option value="PAYMENT">Payment (Decrease Debt)</option>
              {isAdmin && <option value="ADJUSTMENT">Adjustment (Admin Only)</option>}
            </select>
          </div>
          {errors.type && <p className="mt-1 text-sm text-red-600">{errors.type.message}</p>}
        </div>
      )}

      <div>
        <label htmlFor="amount" className="block text-sm font-medium leading-6 text-slate-900">
          Amount
        </label>
        <div className="relative mt-2 rounded-md shadow-sm">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <span className="text-slate-500 sm:text-sm">$</span>
          </div>
          <input
            type="number"
            step="0.01"
            id="amount"
            {...register('amount', { valueAsNumber: true })}
            className="block w-full rounded-md border-0 py-1.5 pl-7 text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
            placeholder="0.00"
          />
        </div>
        {errors.amount && <p className="mt-1 text-sm text-red-600">{errors.amount.message}</p>}
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium leading-6 text-slate-900">
          Description
        </label>
        <div className="mt-2">
          <input
            type="text"
            id="description"
            {...register('description')}
            className="block w-full rounded-md border-0 py-1.5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
            placeholder={
              selectedType === 'SALE' ? 'e.g., Cement and tools' :
              selectedType === 'PAYMENT' ? 'e.g., Cash payment' :
              'e.g., Correction for previous error'
            }
          />
        </div>
        {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
      </div>

      {/* Date (Optional, defaults to today) */}
      <div>
        <label htmlFor="date" className="block text-sm font-medium leading-6 text-slate-900">
          Date <span className="text-slate-400 font-normal">(Defaults to today)</span>
        </label>
        <div className="mt-2">
          <input
            type="date"
            id="date"
            {...register('date')}
            className="block w-full rounded-md border-0 py-1.5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
          />
        </div>
        {errors.date && <p className="mt-1 text-sm text-red-600">{errors.date.message}</p>}
      </div>

      {createTransaction.isError && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error creating transaction</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{(createTransaction.error as any)?.response?.data?.error?.message || 'An unknown error occurred.'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
        <button
          type="submit"
          disabled={createTransaction.isPending}
          className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:col-start-2 disabled:opacity-50"
        >
          {createTransaction.isPending ? 'Saving...' : 'Save Transaction'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={createTransaction.isPending}
          className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 sm:col-start-1 sm:mt-0 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};
