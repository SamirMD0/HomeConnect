import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateCustomer } from '../../customers/hooks/useCustomers';
import { Customer } from '../../customers/api/customers.api';
import { motion } from 'framer-motion';
import { ArrowLeft, User, Phone, MapPin } from 'lucide-react';

const createSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(5, 'Valid phone number required'),
  address: z.string().optional(),
});

type FormData = z.infer<typeof createSchema>;

interface InlineCustomerFormProps {
  initialSearchTerm: string;
  onSuccess: (customer: Customer) => void;
  onBack: () => void;
}

export const InlineCustomerForm: React.FC<InlineCustomerFormProps> = ({ initialSearchTerm, onSuccess, onBack }) => {
  const createCustomer = useCreateCustomer();
  
  // Try to parse search term intelligently (if it's numbers, it's a phone. If letters, it's a name)
  const isLikelyPhone = /^[0-9+\-\s()]+$/.test(initialSearchTerm);
  
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: isLikelyPhone ? '' : initialSearchTerm,
      phone: isLikelyPhone ? initialSearchTerm : '',
      address: '',
    },
  });

  // Auto-focus the field that is empty
  useEffect(() => {
    if (isLikelyPhone) {
      setFocus('name');
    } else {
      setFocus('phone');
    }
  }, [isLikelyPhone, setFocus]);

  const onSubmit = (data: FormData) => {
    createCustomer.mutate(data, {
      onSuccess: (newCustomer) => {
        onSuccess(newCustomer);
      },
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full bg-slate-50"
    >
      <div className="p-6 pb-4 bg-white border-b border-slate-100 shrink-0 flex items-center gap-3">
        <button 
          onClick={onBack}
          className="p-2 -ml-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-slate-800">New Customer</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <form id="inline-customer-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <User className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                {...register('name')}
                className={`block w-full rounded-xl border-0 py-2.5 pl-10 pr-3 text-slate-900 ring-1 ring-inset ${errors.name ? 'ring-red-300 focus:ring-red-500' : 'ring-slate-200 focus:ring-indigo-600'} placeholder:text-slate-400 focus:ring-2 focus:ring-inset sm:text-sm sm:leading-6`}
                placeholder="John Doe"
              />
            </div>
            {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number *</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Phone className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                {...register('phone')}
                className={`block w-full rounded-xl border-0 py-2.5 pl-10 pr-3 text-slate-900 ring-1 ring-inset ${errors.phone ? 'ring-red-300 focus:ring-red-500' : 'ring-slate-200 focus:ring-indigo-600'} placeholder:text-slate-400 focus:ring-2 focus:ring-inset sm:text-sm sm:leading-6`}
                placeholder="+1 234 567 8900"
              />
            </div>
            {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Address (Optional)</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <MapPin className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                {...register('address')}
                className="block w-full rounded-xl border-0 py-2.5 pl-10 pr-3 text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                placeholder="123 Main St"
              />
            </div>
          </div>
        </form>
      </div>
      
      <div className="p-6 bg-white border-t border-slate-100 shrink-0">
         <button
            type="submit"
            form="inline-customer-form"
            disabled={createCustomer.isPending}
            className="w-full inline-flex justify-center items-center rounded-xl bg-indigo-600 px-3 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 transition-colors"
          >
            {createCustomer.isPending ? 'Creating...' : 'Create & Continue'}
          </button>
      </div>
    </motion.div>
  );
};
