import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit2, Trash2, Phone, MapPin, Calendar, User as UserIcon } from 'lucide-react';
import { useCustomer, useUpdateCustomer, useDeleteCustomer } from '../../features/customers/hooks/useCustomers';
import { Modal } from '../../components/ui/Modal';
import { CustomerForm } from '../../features/customers/components/CustomerForm';
import { CustomerDeleteModal } from '../../features/customers/components/CustomerDeleteModal';

export const CustomerProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'transactions'>('info');

  const { data: customer, isLoading, isError } = useCustomer(id || '');
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (isError || !customer) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
        Customer not found or failed to load.
        <button onClick={() => navigate('/customers')} className="ml-4 underline font-medium">Go back</button>
      </div>
    );
  }

  const handleEdit = (formData: any) => {
    updateCustomer.mutate({ id: customer.id, data: formData }, {
      onSuccess: () => setIsEditModalOpen(false)
    });
  };

  const handleDelete = () => {
    deleteCustomer.mutate(customer.id, {
      onSuccess: () => navigate('/customers')
    });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header & Navigation */}
      <div className="flex items-center space-x-4">
        <button 
          onClick={() => navigate('/customers')}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-slate-800">Customer Profile</h1>
      </div>

      {/* Main Profile Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0">
              <UserIcon className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{customer.name}</h2>
              <div className="flex items-center text-slate-500 mt-1 space-x-4 text-sm">
                <span className="flex items-center"><Phone className="w-4 h-4 mr-1.5" /> {customer.phone}</span>
                {customer.address && <span className="flex items-center"><MapPin className="w-4 h-4 mr-1.5" /> {customer.address}</span>}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button 
              onClick={() => setIsEditModalOpen(true)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors focus:ring-2 focus:ring-emerald-500/20 font-medium"
            >
              <Edit2 className="w-4 h-4 mr-2 text-slate-500" />
              Edit
            </button>
            <button 
              onClick={() => setIsDeleteModalOpen(true)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 hover:border-red-300 transition-colors focus:ring-2 focus:ring-red-500/20 font-medium"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-t border-slate-200 px-6 sm:px-8">
          <nav className="flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('info')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'info'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              General Info
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'transactions'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Transactions
            </button>
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
        {activeTab === 'info' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Contact Details</h3>
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm font-medium text-slate-500">Phone Number</dt>
                  <dd className="mt-1 text-sm text-slate-900">{customer.phone}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-slate-500">Address</dt>
                  <dd className="mt-1 text-sm text-slate-900">{customer.address || '—'}</dd>
                </div>
              </dl>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Account Information</h3>
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm font-medium text-slate-500">Account Status</dt>
                  <dd className="mt-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      customer.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'
                    }`}>
                      {customer.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-slate-500">Created At</dt>
                  <dd className="mt-1 text-sm text-slate-900 flex items-center">
                    <Calendar className="w-4 h-4 mr-2 text-slate-400" />
                    {new Date(customer.createdAt).toLocaleDateString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-slate-500">Notes</dt>
                  <dd className="mt-1 text-sm text-slate-900 whitespace-pre-wrap">{customer.notes || '—'}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-slate-900 mb-2">Transactions</h3>
            <p className="text-slate-500">The ledger system will be implemented in Phase 4.</p>
          </div>
        )}
      </div>

      {/* Modals */}
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
