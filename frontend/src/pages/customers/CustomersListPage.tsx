import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Plus, Users } from 'lucide-react';
import { useCreateCustomer } from '../../features/customers/hooks/useCustomers';
import { Customer, CustomerListFilter } from '../../features/customers/api/customers.api';
import { useCustomerSearch } from '../../features/customers/hooks/useCustomerSearch';
import { CustomerSearchInput } from '../../features/customers/components/CustomerSearchInput';
import { formatCustomerPhone } from '../../features/customers/utils/format-customer-phone';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { CustomerForm } from '../../features/customers/components/CustomerForm';
import { formatBusinessDate } from '../../features/customer-financial/utils/financial-format';
import { formatDaysAgo } from '../../features/receivables/utils/receivables-tier';
import { businessLabels } from '../../shared/labels/business-labels';

const emptyCell = <span className="text-slate-400 group-hover:text-yellow-300">—</span>;

export const CustomersListPage: React.FC = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('createdAt');
  const [filter, setFilter] = useState<CustomerListFilter | undefined>();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const customerSearch = useCustomerSearch({
    page,
    limit: pageSize,
    include: 'financial',
    ...(sortBy !== 'createdAt' ? { sortBy, sortOrder: sortBy === 'name' ? 'asc' : 'desc' } : {}),
    ...(filter ? { filter } : {}),
  });
  const { data, isLoading, isError } = customerSearch.customers;
  useEffect(() => setPage(1), [customerSearch.debouncedQuery, pageSize, sortBy, filter]);

  const createCustomer = useCreateCustomer();

  const handleCreateCustomer = (formData: any) => {
    createCustomer.mutate(formData, {
      onSuccess: () => {
        setIsAddModalOpen(false);
      }
    });
  };

  const columns = [
    {
      header: 'Customer',
      accessor: (customer: Customer) => (
        <div className="flex flex-col">
          <span className="user-text font-medium text-slate-900 transition-colors group-hover:text-yellow-300" dir="auto">
            {customer.name}
          </span>
          {customer.matchedInNotesOnly && (
            <span className="text-[11px] text-slate-400 transition-colors group-hover:text-yellow-200">
              Matched in notes
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Phone',
      accessor: (customer: Customer) => formatCustomerPhone(customer.phone),
    },
    {
      header: 'Last payment',
      accessor: (customer: Customer) => {
        const financial = customer.financial;
        if (!financial?.lastPaymentDate) return emptyCell;
        return (
          <div className="flex flex-col">
            <span>{formatBusinessDate(financial.lastPaymentDate)}</span>
            <span className="text-[11px] text-slate-400 transition-colors group-hover:text-yellow-200">
              {formatDaysAgo(financial.daysSinceLastPayment)}
            </span>
          </div>
        );
      },
    },
    {
      header: 'Next due',
      accessor: (customer: Customer) =>
        customer.financial?.nextDueDate ? formatBusinessDate(customer.financial.nextDueDate) : emptyCell,
    },
    {
      header: 'Status',
      accessor: (customer: Customer) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors group-hover:bg-yellow-300 group-hover:text-slate-950 ${
          customer.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
        }`}>
          {customer.isActive ? 'Active' : 'Inactive'}
        </span>
      )
    },
    {
      header: 'Actions',
      accessor: (customer: Customer) => (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            navigate(`/customers/${customer.id}`);
          }}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-all duration-200 hover:border-yellow-300 hover:bg-gray-600 hover:text-yellow-300 hover:shadow-[0_0_14px_rgba(250,204,21,0.4)] focus:outline-none focus:ring-2 focus:ring-yellow-300/50 group-hover:border-yellow-300/70"
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          View profile
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{businessLabels.customer.title}</h1>
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
        <div className="flex-1"><CustomerSearchInput value={customerSearch.query} onChange={customerSearch.setQuery} suggestions={customerSearch.suggestions.data} isLoading={customerSearch.customers.isFetching} resultCount={data?.data.length} /></div>
        <select aria-label="Sort customers" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="name">Name</option><option value="outstanding">Outstanding</option><option value="overdue">Overdue</option><option value="lastPayment">Last payment</option><option value="createdAt">Date added</option></select>
        <select aria-label="Page size" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select>
      </div>
      <div className="flex flex-wrap gap-2">{([['All', undefined], ['With balance', 'withBalance'], ['Overdue', 'overdue'], ['No debt', 'noDebt'], ['Inactive', 'inactive']] as const).map(([label, value]) => <button type="button" key={label} onClick={() => setFilter(value)} className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${filter === value ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800'}`}>{label}</button>)}</div>

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
          {(data?.data ?? []).length > 0 ? (
            <div
              className="hidden max-h-[22rem] overflow-y-auto overscroll-contain rounded-lg bg-slate-100 px-3 pb-3 md:block"
              data-testid="customer-scroll-table"
            >
              <table className="w-full border-separate border-spacing-y-1.5 text-left text-xs text-slate-600">
                <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                  <tr>
                    {columns.map((column) => (
                      <th key={column.header} className="whitespace-nowrap px-4 py-2.5">
                        {column.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.data ?? []).map((customer) => (
                    <tr
                      key={customer.id}
                      onClick={() => navigate(`/customers/${customer.id}`)}
                      className="group cursor-pointer [filter:drop-shadow(0_1px_1px_rgba(15,23,42,0.05))]"
                    >
                      {columns.map((column, index) => (
                        <td
                          key={column.header}
                          className={`bg-white px-4 py-2 align-middle transition-all duration-200 group-hover:bg-gray-600 group-hover:text-yellow-300 group-hover:[text-shadow:0_0_8px_rgba(250,204,21,0.8)] ${index === 0 ? 'rounded-l-md' : ''} ${index === columns.length - 1 ? 'rounded-r-md' : ''}`}
                        >
                          {column.accessor(customer)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={businessLabels.customer.notFound}
              description={customerSearch.debouncedQuery ? `No customers matching "${customerSearch.debouncedQuery}"` : "Get started by creating your first customer."}
              icon={<Users className="w-12 h-12 text-slate-300" />}
              action={
                !customerSearch.debouncedQuery && (
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
          )}
          <div className="grid gap-2 md:hidden">{(data?.data ?? []).map((customer) => <button type="button" key={customer.id} onClick={() => navigate(`/customers/${customer.id}`)} className="group rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition-all duration-200 hover:border-yellow-300 hover:bg-gray-600 hover:text-yellow-300 hover:shadow-[0_0_14px_rgba(250,204,21,0.3)]"><div className="flex items-center justify-between gap-3"><span className="user-text text-sm font-semibold transition-colors group-hover:text-yellow-300" dir="auto">{customer.name}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition-colors group-hover:bg-yellow-300 group-hover:text-slate-950">{customer.isActive ? 'Active' : 'Inactive'}</span></div><p className="mt-0.5 text-xs text-slate-500 transition-colors group-hover:text-yellow-200">{formatCustomerPhone(customer.phone)}</p></button>)}</div>
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
        title="Add New Customer / إضافة زبون جديد"
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
