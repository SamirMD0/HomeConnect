import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Users } from 'lucide-react';
import { useCustomers, useCreateCustomer } from '../../features/customers/hooks/useCustomers';
import { Table } from '../../components/ui/Table';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { CustomerForm } from '../../features/customers/components/CustomerForm';
import { CustomerBalanceCell } from './components/CustomerBalanceCell';

export const CustomersListPage: React.FC = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1); // Reset page on new search
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data, isLoading, isError } = useCustomers({
    page,
    limit: 10,
    search: debouncedSearch,
  });

  const createCustomer = useCreateCustomer();

  const handleCreateCustomer = (formData: any) => {
    createCustomer.mutate(formData, {
      onSuccess: () => {
        setIsAddModalOpen(false);
      }
    });
  };

  const columns = [
    { header: 'Name', accessor: 'name' as const, className: 'font-medium text-slate-900' },
    { header: 'Phone', accessor: 'phone' as const },
    { header: 'Added', accessor: (customer: any) => new Date(customer.createdAt).toLocaleDateString() },
    { 
      header: 'Status', 
      accessor: (customer: any) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          customer.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'
        }`}>
          {customer.isActive ? 'Active' : 'Inactive'}
        </span>
      )
    },
    {
      header: 'Balance',
      accessor: (customer: any) => <CustomerBalanceCell customerId={customer.id} />
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Customers</h1>
          <p className="text-slate-500 mt-1">Manage your customers and their accounts.</p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center justify-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors focus:ring-4 focus:ring-emerald-500/20 font-medium"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Customer
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm transition-colors"
            placeholder="Search customers by name or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Content */}
      {isLoading && !data ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      ) : isError ? (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
          Failed to load customers. Please try again.
        </div>
      ) : (
        <div className="space-y-4">
          <Table
            data={data?.data || []}
            columns={columns}
            keyExtractor={(item) => item.id}
            onRowClick={(item) => navigate(`/customers/${item.id}`)}
            emptyState={
              <EmptyState
                title="No customers found"
                description={debouncedSearch ? `No customers matching "${debouncedSearch}"` : "Get started by creating your first customer."}
                icon={<Users className="w-12 h-12 text-slate-300" />}
                action={
                  !debouncedSearch && (
                    <button
                      onClick={() => setIsAddModalOpen(true)}
                      className="mt-2 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
                    >
                      <Plus className="w-5 h-5 mr-2 -ml-1" aria-hidden="true" />
                      Add Customer
                    </button>
                  )
                }
              />
            }
          />
          {data?.meta && data.meta.pagination.totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={data.meta.pagination.totalPages}
              onPageChange={setPage}
            />
          )}
        </div>
      )}

      {/* Add Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => !createCustomer.isPending && setIsAddModalOpen(false)}
        title="Add New Customer"
      >
        <CustomerForm
          onSubmit={handleCreateCustomer}
          onCancel={() => setIsAddModalOpen(false)}
          isSubmitting={createCustomer.isPending}
        />
      </Modal>
    </div>
  );
};
