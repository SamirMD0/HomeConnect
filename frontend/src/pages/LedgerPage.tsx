import React, { useState } from 'react';
import { useTransactions, useCreateTransaction, useUpdateTransaction, useDeleteTransaction } from '../features/transactions/hooks/useTransactions';
import { useCustomers } from '../features/customers/hooks/useCustomers';
import { TransactionType, TransactionQueryOptions } from '../features/transactions/types';
import { Modal } from '../components/ui/Modal';
import { Plus, Search, Filter, ArrowUpRight, ArrowDownLeft, AlertCircle, ChevronLeft, ChevronRight, Pencil, Trash2, Calendar, UserPlus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../hooks/useAuth';

const newTransactionSchema = z.object({
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  type: z.enum(['SALE', 'PAYMENT', 'ADJUSTMENT']),
  amount: z.number().positive('Amount must be positive'),
  description: z.string().min(1, 'Description is required'),
  date: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  parentId: z.string().optional(),
}).refine(data => data.customerId || (data.customerName && data.customerPhone), {
  message: "Please select a customer or provide name and phone to create a new one.",
  path: ["customerId"]
});

const updateTransactionSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  description: z.string().min(1, 'Description is required'),
  dueDate: z.string().optional().nullable(),
});

type NewTransactionFormData = z.infer<typeof newTransactionSchema>;
type UpdateTransactionFormData = z.infer<typeof updateTransactionSchema>;

export const LedgerPage: React.FC = () => {

  // Filters
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<TransactionType | ''>('');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const limit = 15;

  // Build query
  const queryOptions: TransactionQueryOptions = {
    page,
    limit,
    ...(typeFilter ? { type: typeFilter as TransactionType } : {}),
  };

  const { data, isLoading } = useTransactions(queryOptions);
  const transactions = data?.data || [];
  const totalItems = data?.meta?.pagination?.totalItems || 0;
  const totalPages = data?.meta?.pagination?.totalPages || 1;

  // Customer search for the modal
  const [modalCustomerSearch, setModalCustomerSearch] = useState('');
  const { data: customerData } = useCustomers({ search: modalCustomerSearch, limit: 10 });
  const customerOptions = customerData?.data || [];

  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingTransaction, setDeletingTransaction] = useState<any>(null);

  const [isNewCustomer, setIsNewCustomer] = useState(false);

  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();
  const deleteTransaction = useDeleteTransaction();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<NewTransactionFormData>({
    resolver: zodResolver(newTransactionSchema),
    defaultValues: {
      customerId: '',
      customerName: '',
      customerPhone: '',
      type: 'SALE',
      amount: undefined,
      description: '',
      dueDate: '',
    },
  });

  const {
    register: registerUpdate,
    handleSubmit: handleUpdateSubmit,
    reset: resetUpdate,
    formState: { errors: updateErrors },
  } = useForm<UpdateTransactionFormData>({
    resolver: zodResolver(updateTransactionSchema),
  });

  const selectedType = watch('type');
  const selectedCustomerId = watch('customerId');

  const onSubmit = (formData: NewTransactionFormData) => {
    const payload = { ...formData };
    if (!payload.dueDate) {
      delete payload.dueDate;
    } else {
      payload.dueDate = new Date(payload.dueDate).toISOString();
    }

    if (!payload.date) {
      delete payload.date; // Remove the key so it's undefined, avoiding type errors with null
    } else {
      payload.date = new Date(payload.date).toISOString();
    }
    
    if (isNewCustomer) {
      payload.customerId = undefined; // Ensure we don't pass an empty string
    } else {
      payload.customerName = undefined;
      payload.customerPhone = undefined;
    }

    if (!payload.parentId) {
      payload.parentId = undefined;
    }

    createTransaction.mutate(payload as any, {
      onSuccess: () => {
        setIsNewModalOpen(false);
        reset();
        setModalCustomerSearch('');
        setIsNewCustomer(false);
      },
    });
  };

  const onUpdateSubmit = (formData: UpdateTransactionFormData) => {
    if (!editingTransaction) return;
    const payload = { ...formData };
    if (!payload.dueDate) {
      delete payload.dueDate;
    } else {
      payload.dueDate = new Date(payload.dueDate).toISOString();
    }

    updateTransaction.mutate({ id: editingTransaction.id, data: payload }, {
      onSuccess: () => {
        setIsEditModalOpen(false);
        setEditingTransaction(null);
      }
    });
  };

  const onDeleteConfirm = () => {
    if (!deletingTransaction) return;
    deleteTransaction.mutate(deletingTransaction.id, {
      onSuccess: () => {
        setIsDeleteModalOpen(false);
        setDeletingTransaction(null);
      }
    });
  };

  const openNewModal = (type: 'SALE' | 'PAYMENT' | 'ADJUSTMENT') => {
    reset();
    setValue('type', type);
    setModalCustomerSearch('');
    setIsNewCustomer(false);
    setIsNewModalOpen(true);
  };

  const openEditModal = (tx: any) => {
    setEditingTransaction(tx);
    resetUpdate({
      amount: Number(tx.amount),
      description: tx.description,
      dueDate: tx.dueDate ? new Date(tx.dueDate).toISOString().split('T')[0] : '',
    });
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (tx: any) => {
    setDeletingTransaction(tx);
    setIsDeleteModalOpen(true);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ledger</h1>
          <p className="mt-1 text-sm text-slate-500">
            All sales, payments, and adjustments across all customers.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => openNewModal('SALE')}
            className="inline-flex items-center justify-center px-5 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors focus:ring-2 focus:ring-red-500/20 font-medium shadow-sm"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Debt
          </button>
          <button
            onClick={() => openNewModal('PAYMENT')}
            className="inline-flex items-center justify-center px-5 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors focus:ring-2 focus:ring-emerald-500/20 font-medium shadow-sm"
          >
            <Plus className="w-5 h-5 mr-2" />
            Receive Payment
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="flex items-center gap-2 text-slate-500">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">Filter:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setTypeFilter(''); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              typeFilter === '' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => { setTypeFilter('SALE'); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              typeFilter === 'SALE' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Sales
          </button>
          <button
            onClick={() => { setTypeFilter('PAYMENT'); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              typeFilter === 'PAYMENT' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Payments
          </button>
          <button
            onClick={() => { setTypeFilter('ADJUSTMENT'); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              typeFilter === 'ADJUSTMENT' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Adjustments
          </button>
        </div>
        <div className="sm:ml-auto text-sm text-slate-500">
          {totalItems} transaction{totalItems !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="mx-auto w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-1">No transactions found</h3>
            <p className="text-sm text-slate-500 mb-6">
              {typeFilter ? `No ${typeFilter.toLowerCase()} transactions recorded yet.` : 'Start by recording your first transaction.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => openNewModal('SALE')}
                className="inline-flex items-center px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors font-medium text-sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Debt
              </button>
              <button
                onClick={() => openNewModal('PAYMENT')}
                className="inline-flex items-center px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors font-medium text-sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                Receive Payment
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Created At</th>
                    <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</th>
                    <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                    <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Due Date</th>
                    <th className="text-right px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                    <th className="text-right px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {transactions.map((tx: any) => {
                    const totalPaid = tx.payments?.reduce((sum: number, p: any) => sum + Number(p.amount), 0) || 0;
                    const remaining = Number(tx.amount) - totalPaid;

                    return (
                      <React.Fragment key={tx.id}>
                        <tr className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">
                          {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-slate-900">{tx.customer?.name || '—'}</div>
                          <div className="text-xs text-slate-400">{tx.customer?.phone || ''}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                          {tx.description}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">
                          {tx.dueDate ? new Date(tx.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </td>
                        <td className={`px-6 py-4 text-sm font-semibold text-right whitespace-nowrap ${
                          tx.type === 'SALE' ? 'text-red-600' : tx.type === 'PAYMENT' ? 'text-green-600' : 'text-amber-600'
                        }`}>
                          <div className="flex flex-col items-end">
                            <span>{tx.type === 'SALE' ? '+' : tx.type === 'PAYMENT' ? '-' : ''}${Number(tx.amount).toFixed(2)}</span>
                            {tx.type === 'SALE' && totalPaid > 0 && (
                              <span className="text-xs text-slate-500 font-normal mt-0.5">Bal: ${remaining.toFixed(2)}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2 text-slate-400">
                            {tx.type === 'SALE' && (
                              remaining <= 0 ? (
                                <span className="p-1.5 px-3 mr-2 bg-slate-100 text-slate-500 rounded-md font-medium text-xs">
                                  Paid
                                </span>
                              ) : (
                                <button
                                  onClick={() => {
                                    reset();
                                    setValue('type', 'PAYMENT');
                                    setValue('customerId', tx.customerId);
                                    setValue('parentId', tx.id);
                                    setModalCustomerSearch(tx.customer?.name || '');
                                    setIsNewCustomer(false);
                                    setIsNewModalOpen(true);
                                  }}
                                  className="p-1.5 px-3 mr-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-md font-medium text-xs transition-colors"
                                  title="Receive Payment"
                                >
                                  Pay
                                </button>
                              )
                            )}
                            <button
                              onClick={() => openEditModal(tx)}
                              className="p-1 hover:text-indigo-600 transition-colors"
                              title="Edit Transaction"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openDeleteModal(tx)}
                              className="p-1 hover:text-red-600 transition-colors"
                              title="Delete Transaction"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {/* Nested Payments */}
                      {tx.payments && tx.payments.length > 0 && tx.payments.map((payment: any) => (
                        <tr key={payment.id} className="bg-slate-50/30 text-sm border-t-0">
                          <td className="px-6 py-2.5 pl-12 text-slate-500 whitespace-nowrap border-t-0">
                            <span className="text-slate-300 mr-2">↳</span>
                            {new Date(payment.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="px-6 py-2.5 border-t-0"></td>
                          <td className="px-6 py-2.5 text-slate-500 border-t-0">
                            {payment.description}
                          </td>
                          <td className="px-6 py-2.5 border-t-0"></td>
                          <td className="px-6 py-2.5 text-emerald-600 font-medium text-right border-t-0">
                            -${Number(payment.amount).toFixed(2)}
                          </td>
                          <td className="px-6 py-2.5 text-right whitespace-nowrap border-t-0">
                            <div className="flex items-center justify-end gap-2 text-slate-300">
                              <button onClick={() => openEditModal(payment)} className="p-1 hover:text-indigo-600 transition-colors" title="Edit Payment"><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => openDeleteModal(payment)} className="p-1 hover:text-red-600 transition-colors" title="Delete Payment"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
                <p className="text-sm text-slate-500">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* New Transaction Modal */}
      <Modal 
        isOpen={isNewModalOpen} 
        onClose={() => setIsNewModalOpen(false)} 
        title={watch('type') === 'SALE' ? 'Add Debt' : watch('type') === 'PAYMENT' ? 'Receive Payment' : 'Record Transaction'} 
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Customer Search + Select */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-700">Customer *</label>
              {!watch('parentId') && (
                <button
                  type="button"
                  onClick={() => {
                    setIsNewCustomer(!isNewCustomer);
                    reset({ ...watch(), customerId: '', customerName: '', customerPhone: '' });
                  }}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center"
                >
                  {isNewCustomer ? 'Select Existing' : <><UserPlus className="w-3 h-3 mr-1" /> New Customer</>}
                </button>
              )}
            </div>

            {watch('parentId') ? (
              <div className="px-4 py-2.5 bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-medium text-sm">
                {modalCustomerSearch}
                <input type="hidden" {...register('customerId')} />
              </div>
            ) : isNewCustomer ? (
              <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <input
                    type="text"
                    {...register('customerName')}
                    placeholder="Customer Name"
                    className="block w-full rounded-lg border-0 py-2 text-slate-900 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
                  />
                  {errors.customerName && <p className="mt-1 text-xs text-red-600">{errors.customerName.message}</p>}
                </div>
                <div>
                  <input
                    type="text"
                    {...register('customerPhone')}
                    placeholder="Phone Number"
                    className="block w-full rounded-lg border-0 py-2 text-slate-900 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
                  />
                  {errors.customerPhone && <p className="mt-1 text-xs text-red-600">{errors.customerPhone.message}</p>}
                </div>
              </div>
            ) : (
              <>
                <div className="relative mb-2">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Search className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    className="block w-full rounded-lg border-0 py-2 pl-10 pr-3 text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
                    placeholder="Search customers by name or phone..."
                    value={modalCustomerSearch}
                    onChange={(e) => setModalCustomerSearch(e.target.value)}
                  />
                </div>
                {customerOptions.length > 0 && (
                  <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-50">
                    {customerOptions.map((c: any) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setValue('customerId', c.id);
                          setModalCustomerSearch(c.name);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors ${
                          selectedCustomerId === c.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700'
                        }`}
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-slate-400 ml-2">· {c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
                <input type="hidden" {...register('customerId')} />
              </>
            )}
            {errors.customerId && <p className="mt-1 text-sm text-red-600">{errors.customerId.message}</p>}
          </div>

          <input type="hidden" {...register('type')} />
          <input type="hidden" {...register('parentId')} />

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount *</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <span className="text-slate-400 text-sm">$</span>
              </div>
              <input
                type="number"
                step="0.01"
                {...register('amount', { valueAsNumber: true })}
                className="block w-full rounded-lg border-0 py-2 pl-7 pr-3 text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
                placeholder="0.00"
              />
            </div>
            {errors.amount && <p className="mt-1 text-sm text-red-600">{errors.amount.message}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description *</label>
            <input
              type="text"
              {...register('description')}
              className="block w-full rounded-lg border-0 py-2 text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
              placeholder={
                selectedType === 'SALE' ? 'e.g., Cement and tools' :
                selectedType === 'PAYMENT' ? 'e.g., Cash payment' :
                'e.g., Correction for previous error'
              }
            />
            {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
          </div>

          {/* Date (Optional, defaults to today) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Date <span className="text-slate-400 font-normal">(Defaults to today)</span>
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Calendar className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="date"
                {...register('date')}
                className="block w-full rounded-lg border-0 py-2 pl-10 text-slate-900 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
              />
            </div>
            {errors.date && <p className="mt-1 text-sm text-red-600">{errors.date.message}</p>}
          </div>

          {/* Due Date (Optional) */}
          {selectedType === 'SALE' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Due Date (Optional)</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Calendar className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="date"
                  {...register('dueDate')}
                  className="block w-full rounded-lg border-0 py-2 pl-10 pr-3 text-slate-900 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">When is the customer expected to pay?</p>
            </div>
          )}

          {/* Error Display */}
          {createTransaction.isError && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {(createTransaction.error as any)?.response?.data?.error?.message || 'Failed to create transaction.'}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={createTransaction.isPending}
              className="flex-1 inline-flex justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {createTransaction.isPending ? 'Saving...' : 'Save Transaction'}
            </button>
            <button
              type="button"
              onClick={() => setIsNewModalOpen(false)}
              disabled={createTransaction.isPending}
              className="flex-1 inline-flex justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Transaction" maxWidth="max-w-lg">
        <form onSubmit={handleUpdateSubmit(onUpdateSubmit)} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount *</label>
            <input
              type="number"
              step="0.01"
              {...registerUpdate('amount', { valueAsNumber: true })}
              className="block w-full rounded-lg border-0 py-2 text-slate-900 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
            />
            {updateErrors.amount && <p className="mt-1 text-sm text-red-600">{updateErrors.amount.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description *</label>
            <input
              type="text"
              {...registerUpdate('description')}
              className="block w-full rounded-lg border-0 py-2 text-slate-900 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
            />
            {updateErrors.description && <p className="mt-1 text-sm text-red-600">{updateErrors.description.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Due Date (Optional)</label>
            <input
              type="date"
              {...registerUpdate('dueDate')}
              className="block w-full rounded-lg border-0 py-2 text-slate-900 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
            />
          </div>

          {updateTransaction.isError && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {(updateTransaction.error as any)?.response?.data?.error?.message || 'Failed to update transaction.'}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={updateTransaction.isPending}
              className="flex-1 inline-flex justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {updateTransaction.isPending ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="flex-1 inline-flex justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Delete Transaction" maxWidth="max-w-md">
        <div className="space-y-4">
          <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-red-800">Are you sure?</h4>
              <p className="mt-1 text-sm text-red-700 opacity-90">
                This will soft-delete the transaction and remove it from the customer's balance. This action cannot be undone.
              </p>
            </div>
          </div>

          {deleteTransaction.isError && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {(deleteTransaction.error as any)?.response?.data?.error?.message || 'Failed to delete transaction.'}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onDeleteConfirm}
              disabled={deleteTransaction.isPending}
              className="flex-1 inline-flex justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50 transition-colors"
            >
              {deleteTransaction.isPending ? 'Deleting...' : 'Delete Transaction'}
            </button>
            <button
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={deleteTransaction.isPending}
              className="flex-1 inline-flex justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
