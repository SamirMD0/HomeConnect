import React, { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Copy, Edit2, MapPin, Phone, Trash2, User as UserIcon, WalletCards } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '../../components/ui/Modal';
import { CustomerDeleteModal } from '../../features/customers/components/CustomerDeleteModal';
import { CustomerForm } from '../../features/customers/components/CustomerForm';
import { useCustomer, useDeleteCustomer, useUpdateCustomer } from '../../features/customers/hooks/useCustomers';
import { CustomerFinancialProfile, FinancialProfileTab } from '../../features/customer-financial/components/CustomerFinancialProfile';
import { TransactionList } from '../../features/transactions/components/TransactionList';
import { CustomerServiceJobsSection } from '../../features/service/components/CustomerServiceJobsSection';
import { CustomerSalesOrdersSection } from '../../features/sales-orders/components/CustomerSalesOrdersSection';
import { businessLabels } from '../../shared/labels/business-labels';
import { useAuth } from '../../hooks/useAuth';
import { isFinancialAdmin } from '../../features/customer-financial/utils/financial-auth';
import { AddFinancialObligationDialog } from '../../features/customer-financial/components/AddFinancialObligationDialog';
import { GlobalReceivePaymentDialog } from '../../features/financial-ledger/components/GlobalReceivePaymentDialog';

interface CustomerFormData {
  name: string;
  phone: string;
  address?: string;
  notes?: string;
}

export const CustomerProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [financialAction, setFinancialAction] = useState<'add' | 'payment' | null>(null);
  const { user } = useAuth();
  const canMutateFinancial = isFinancialAdmin(user?.role);

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
          className="rounded-full bg-slate-100 p-2 text-slate-600 transition-colors hover:bg-emerald-100 hover:text-emerald-700"
          aria-label="Back to customers"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <h1 className="text-2xl font-bold text-slate-800">{businessLabels.customer.profile}</h1>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-4 lg:z-10">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
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
                  {customer.isActive ? businessLabels.customer.active : businessLabels.customer.inactive}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
                <span className="flex items-center">
                  <Phone className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {customer.phone}
                  <button type="button" className="ml-2 rounded-md bg-emerald-50 p-1.5 text-emerald-600 transition-colors hover:bg-emerald-600 hover:text-white" aria-label={businessLabels.customer.copyPhone} onClick={() => { void navigator.clipboard?.writeText(customer.phone); toast.success('Phone copied / تم نسخ الهاتف'); }}><Copy className="h-4 w-4" /></button>
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
              className="inline-flex flex-1 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 font-medium text-blue-700 transition-colors hover:border-blue-600 hover:bg-blue-600 hover:text-white focus:ring-2 focus:ring-blue-500/20 sm:flex-none"
            >
              <Edit2 className="mr-2 h-4 w-4" aria-hidden="true" />
              {businessLabels.common.edit}
            </button>
            <button type="button" onClick={() => setSearchParams({ tab: 'details' })} className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 transition-colors hover:border-violet-600 hover:bg-violet-600 hover:text-white">Details &amp; Notes</button>
            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(true)}
              className="inline-flex flex-1 items-center justify-center rounded-lg border border-red-200 bg-red-50 px-4 py-2 font-medium text-red-700 transition-colors hover:border-red-600 hover:bg-red-600 hover:text-white focus:ring-2 focus:ring-red-500/20 sm:flex-none"
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Delete / حذف
            </button>
          </div>
        </div>
      </div>

      <section
        aria-labelledby="customer-financial-actions-title"
        className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <WalletCards className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="customer-financial-actions-title" className="font-semibold text-slate-900">
                Financial Actions / الإجراءات المالية
              </h2>
              <p className="mt-0.5 text-sm text-slate-600">
                Manage debts, payments, installment plans, and ledger history.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {canMutateFinancial && (
              <>
                <button type="button" onClick={() => setFinancialAction('add')} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700">{businessLabels.customer.addDebt}</button>
                <button type="button" onClick={() => setFinancialAction('payment')} className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:border-emerald-600 hover:bg-emerald-600 hover:text-white">{businessLabels.customer.recordPayment}</button>
                <button type="button" onClick={() => setFinancialAction('add')} className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition-colors hover:border-indigo-600 hover:bg-indigo-600 hover:text-white">{businessLabels.customer.addInstallmentPlan}</button>
              </>
            )}
            <button type="button" onClick={() => setSearchParams({ tab: 'legacy' })} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:border-amber-500 hover:bg-amber-500 hover:text-white">{businessLabels.customer.viewLedger}</button>
          </div>
        </div>
      </section>

      {searchParams.get('tab') === 'details' && <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div>
            <h3 className="mb-4 text-lg font-semibold text-slate-800">{businessLabels.customer.contactDetails}</h3>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-slate-500">{businessLabels.customer.phone}</dt>
                <dd className="mt-1 text-sm text-slate-900">{customer.phone}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">{businessLabels.customer.address}</dt>
                <dd className="user-text mt-1 text-sm text-slate-900" dir="auto">{customer.address || '—'}</dd>
              </div>
            </dl>
          </div>
          <div>
            <h3 className="mb-4 text-lg font-semibold text-slate-800">{businessLabels.customer.accountInformation}</h3>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-slate-500">{businessLabels.common.created}</dt>
                <dd className="mt-1 flex items-center text-sm text-slate-900">
                  <Calendar className="mr-2 h-4 w-4 text-slate-400" aria-hidden="true" />
                  {new Date(customer.createdAt).toLocaleDateString('en-GB')}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-500">{businessLabels.common.notes}</dt>
                <dd className="user-text-pre mt-1 text-sm text-slate-900" dir="auto">
                  {customer.notes || '—'}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>}

      {searchParams.get('tab') !== 'details' && <CustomerFinancialProfile
        customerId={customer.id}
        legacyLedger={<TransactionList customerId={customer.id} />}
        activeTab={(searchParams.get('tab') as FinancialProfileTab | null) ?? 'overview'}
        onTabChange={(tab) => setSearchParams({ tab })}
      />}

      <CustomerServiceJobsSection customerId={customer.id} />
      <CustomerSalesOrdersSection customerId={customer.id} />

      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={businessLabels.customer.edit}>
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
      <Modal isOpen={financialAction !== null} onClose={() => setFinancialAction(null)} title={financialAction === 'payment' ? businessLabels.customer.recordPayment : businessLabels.customer.addDebt} maxWidth="max-w-3xl">
        {financialAction === 'add' ? <AddFinancialObligationDialog customer={customer} onSuccess={() => setFinancialAction(null)} /> : financialAction === 'payment' ? <GlobalReceivePaymentDialog initialCustomer={customer} onSuccess={() => setFinancialAction(null)} /> : null}
      </Modal>
    </div>
  );
};
