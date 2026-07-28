import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Edit2, MapPin, Phone, Trash2, User as UserIcon } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { CustomerDeleteModal } from '../../features/customers/components/CustomerDeleteModal';
import { CustomerForm } from '../../features/customers/components/CustomerForm';
import { useCustomer, useDeleteCustomer, useUpdateCustomer } from '../../features/customers/hooks/useCustomers';
import { CustomerFinancialProfile } from '../../features/customer-financial/components/CustomerFinancialProfile';
import { TransactionList } from '../../features/transactions/components/TransactionList';

interface CustomerFormData {
  name: string;
  phone: string;
  address?: string;
  notes?: string;
}

export const CustomerProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const { data: customer, isLoading, isError } = useCustomer(id || '');
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();

  if (isLoading) {
    return (
      <div className="flex justify-center p-12" aria-live="polite" aria-busy="true">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
        <span className="sr-only">Loading customer profile</span>
      </div>
    );
  }

  if (isError || !customer) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700" role="alert">
        Customer not found or failed to load.
        <button
          type="button"
          onClick={() => navigate('/customers')}
          className="ml-4 font-medium underline"
        >
          Go back
        </button>
      </div>
    );
  }

  const handleEdit = (formData: CustomerFormData) => {
    updateCustomer.mutate(
      { id: customer.id, data: formData },
      {
        onSuccess: () => setIsEditModalOpen(false),
      }
    );
  };

  const handleDelete = () => {
    deleteCustomer.mutate(customer.id, {
      onSuccess: () => navigate('/customers'),
    });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center space-x-4">
        <button
          type="button"
          onClick={() => navigate('/customers')}
          className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Back to customers"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <h1 className="text-2xl font-bold text-slate-800">Customer Profile</h1>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <UserIcon className="h-8 w-8" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="user-text text-2xl font-bold text-slate-900" dir="auto">{customer.name}</h2>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    customer.isActive
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  {customer.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
                <span className="flex items-center">
                  <Phone className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {customer.phone}
                </span>
                {customer.address && (
                  <span className="user-text flex items-center" dir="auto">
                    <MapPin className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {customer.address}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:ring-2 focus:ring-emerald-500/20 sm:flex-none"
            >
              <Edit2 className="mr-2 h-4 w-4 text-slate-500" aria-hidden="true" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(true)}
              className="inline-flex flex-1 items-center justify-center rounded-lg border border-red-200 bg-white px-4 py-2 font-medium text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 focus:ring-2 focus:ring-red-500/20 sm:flex-none"
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Delete
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div>
            <h3 className="mb-4 text-lg font-semibold text-slate-800">Contact Details</h3>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-slate-500">Phone Number</dt>
                <dd className="mt-1 text-sm text-slate-900">{customer.phone}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">Address</dt>
                <dd className="user-text mt-1 text-sm text-slate-900" dir="auto">{customer.address || '—'}</dd>
              </div>
            </dl>
          </div>
          <div>
            <h3 className="mb-4 text-lg font-semibold text-slate-800">Account Information</h3>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-slate-500">Created At</dt>
                <dd className="mt-1 flex items-center text-sm text-slate-900">
                  <Calendar className="mr-2 h-4 w-4 text-slate-400" aria-hidden="true" />
                  {new Date(customer.createdAt).toLocaleDateString('en-GB')}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">Notes</dt>
                <dd className="user-text-pre mt-1 text-sm text-slate-900" dir="auto">
                  {customer.notes || '—'}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <CustomerFinancialProfile
        customerId={customer.id}
        legacyLedger={<TransactionList customerId={customer.id} />}
      />

      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Customer">
        <CustomerForm
          initialData={customer}
          onSubmit={handleEdit}
          onCancel={() => setIsEditModalOpen(false)}
          isSubmitting={updateCustomer.isPending}
        />
      </Modal>

      <CustomerDeleteModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        customerName={customer.name}
        isDeleting={deleteCustomer.isPending}
      />
    </div>
  );
};
