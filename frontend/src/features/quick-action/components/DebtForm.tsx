import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateTransaction } from '../../transactions/hooks/useTransactions';
import { Customer } from '../../customers/api/customers.api';
import { motion } from 'framer-motion';
import { ArrowLeft, DollarSign, FileText } from 'lucide-react';

const debtSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  description: z.string().min(1, 'Description is required'),
});

type FormData = z.infer<typeof debtSchema>;

interface DebtFormProps {
  customer: Customer;
  onSuccess: () => void;
  onBack: () => void;
}

export const DebtForm: React.FC<DebtFormProps> = ({ customer, onSuccess, onBack }) => {
  const createTransaction = useCreateTransaction();
  
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(debtSchema),
    defaultValues: {
      amount: undefined,
      description: '',
    },
  });

  useEffect(() => {
    setFocus('amount');
  }, [setFocus]);

  const onSubmit = (data: FormData) => {
    createTransaction.mutate(
      {
        customerId: customer.id,
        type: 'SALE', // Recording debt = SALE
        amount: data.amount,
        description: data.description,
      },
      {
        onSuccess: () => {
          onSuccess();
        },
      }
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full bg-slate-50"
    >
      <div className="p-6 pb-4 bg-white border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <button 
            onClick={onBack}
            className="p-2 -ml-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-slate-800">Record Debt</h2>
        </div>
        
        {/* Customer Header Card */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex justify-between items-center">
           <div>
              <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wider mb-0.5">Customer</p>
              <h3 className="text-base font-bold text-slate-900">{customer.name}</h3>
              <p className="text-sm text-slate-500">{customer.phone}</p>
           </div>
           <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
             {customer.name.charAt(0).toUpperCase()}
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <form id="debt-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Debt Amount *</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <DollarSign className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="number"
                step="0.01"
                {...register('amount', { valueAsNumber: true })}
                className={`block w-full rounded-xl border-0 py-3 pl-10 pr-3 text-slate-900 ring-1 ring-inset ${errors.amount ? 'ring-red-300 focus:ring-red-500' : 'ring-slate-200 focus:ring-indigo-600'} placeholder:text-slate-400 focus:ring-2 focus:ring-inset sm:text-lg sm:leading-6 font-medium`}
                placeholder="0.00"
              />
            </div>
            {errors.amount && <p className="mt-1 text-sm text-red-600">{errors.amount.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description / Items *</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <FileText className="h-4 w-4 text-slate-400" />
              </div>
              <textarea
                rows={3}
                {...register('description')}
                className={`block w-full rounded-xl border-0 py-2.5 pl-10 pr-3 text-slate-900 ring-1 ring-inset ${errors.description ? 'ring-red-300 focus:ring-red-500' : 'ring-slate-200 focus:ring-indigo-600'} placeholder:text-slate-400 focus:ring-2 focus:ring-inset sm:text-sm sm:leading-6 resize-none`}
                placeholder="What was this debt for?"
              />
            </div>
            {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
          </div>
        </form>
      </div>
      
      <div className="p-6 bg-white border-t border-slate-100 shrink-0">
         <button
            type="submit"
            form="debt-form"
            disabled={createTransaction.isPending}
            className="w-full inline-flex justify-center items-center rounded-xl bg-red-600 px-3 py-3 text-sm font-semibold text-white shadow-sm hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50 transition-colors"
          >
            {createTransaction.isPending ? 'Recording...' : 'Add Debt to Customer'}
          </button>
      </div>
    </motion.div>
  );
};
