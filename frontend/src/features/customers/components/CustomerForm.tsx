import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const customerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name is too long'),
  phone: z.string().min(5, 'Phone number is required').max(20, 'Phone is too long'),
  address: z.string().max(255, 'Address is too long').optional(),
  notes: z.string().optional(),
});

type CustomerFormData = z.infer<typeof customerSchema>;

interface CustomerFormProps {
  initialData?: {
    name: string;
    phone: string;
    address?: string | null;
    notes?: string | null;
  };
  onSubmit: (data: CustomerFormData) => void;
  isSubmitting?: boolean;
  onCancel: () => void;
}

export const CustomerForm: React.FC<CustomerFormProps> = ({ initialData, onSubmit, isSubmitting, onCancel }) => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: initialData?.name || '',
      phone: initialData?.phone || '',
      address: initialData?.address || '',
      notes: initialData?.notes || '',
    },
  });

  useEffect(() => {
    if (initialData) {
      reset({
        name: initialData.name || '',
        phone: initialData.phone || '',
        address: initialData.address || '',
        notes: initialData.notes || '',
      });
    }
  }, [initialData, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Customer Name *</label>
        <input
          type="text"
          {...register('name')}
          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:outline-none transition-all ${
            errors.name ? 'border-red-500 focus:ring-red-200' : 'border-slate-300 focus:ring-emerald-500/20 focus:border-emerald-500'
          }`}
          placeholder="e.g. John Doe"
        />
        {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number *</label>
        <input
          type="text"
          {...register('phone')}
          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:outline-none transition-all ${
            errors.phone ? 'border-red-500 focus:ring-red-200' : 'border-slate-300 focus:ring-emerald-500/20 focus:border-emerald-500'
          }`}
          placeholder="e.g. 555-123-4567"
        />
        {errors.phone && <p className="mt-1 text-sm text-red-500">{errors.phone.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Address (Optional)</label>
        <input
          type="text"
          {...register('address')}
          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:outline-none transition-all ${
            errors.address ? 'border-red-500 focus:ring-red-200' : 'border-slate-300 focus:ring-emerald-500/20 focus:border-emerald-500'
          }`}
          placeholder="e.g. 123 Main St, City"
        />
        {errors.address && <p className="mt-1 text-sm text-red-500">{errors.address.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Notes (Optional)</label>
        <textarea
          {...register('notes')}
          rows={3}
          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:outline-none transition-all ${
            errors.notes ? 'border-red-500 focus:ring-red-200' : 'border-slate-300 focus:ring-emerald-500/20 focus:border-emerald-500'
          }`}
          placeholder="Any additional details..."
        />
        {errors.notes && <p className="mt-1 text-sm text-red-500">{errors.notes.message}</p>}
      </div>

      <div className="flex items-center justify-end pt-4 space-x-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 focus:ring-4 focus:ring-emerald-500/20 transition-all disabled:opacity-50 flex items-center"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Saving...
            </>
          ) : (
            'Save Customer'
          )}
        </button>
      </div>
    </form>
  );
};
