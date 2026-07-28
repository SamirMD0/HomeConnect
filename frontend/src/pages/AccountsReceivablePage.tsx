import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../hooks/useAuth';
import { isFinancialAdmin } from '../features/customer-financial/utils/financial-auth';
import { GlobalReceivePaymentDialog } from '../features/financial-ledger/components/GlobalReceivePaymentDialog';
import { useExpandedRows } from '../features/financial-ledger/hooks/useExpandedRows';
import {
  ReceivablesFilters,
  resetReceivableFilters,
} from '../features/receivables/components/ReceivablesFilters';
import {
  ReceivablesEmptyState,
  ReceivablesErrorState,
  ReceivablesLoadingState,
} from '../features/receivables/components/ReceivablesStates';
import { ReceivablesSummaryCards } from '../features/receivables/components/ReceivablesSummaryCards';
import { ReceivablesTable } from '../features/receivables/components/ReceivablesTable';
import {
  receivablesQueryKeyPrefix,
  useReceivables,
} from '../features/receivables/hooks/useReceivables';
import {
  ReceivableCustomer,
  ReceivableFilters,
  ReceivableItem,
  ReceivableSortBy,
} from '../features/receivables/types/receivables.types';
import { hasActiveReceivableFilters } from '../features/receivables/utils/receivables-query';

const emptyTierCounts = {
  NO_ACTIVITY: 0,
  CURRENT: 0,
  WATCH: 0,
  LATE: 0,
  SEVERE: 0,
  CRITICAL: 0,
};

export const AccountsReceivablePage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canMutate = isFinancialAdmin(user?.role);
  const [filters, setFilters] = useState<ReceivableFilters>({
    tier: [],
    onlyWithBalance: false,
    includeInactive: false,
    page: 1,
    limit: 25,
    sortBy: 'standing',
    sortOrder: 'desc',
  });
  const [customerForPayment, setCustomerForPayment] = useState<ReceivableCustomer | null>(null);
  const { expandedRows, toggleRow } = useExpandedRows();

  const { data, isLoading, isError, refetch } = useReceivables(filters);

  const goToPage = (page: number) => setFilters((current) => ({ ...current, page }));

  const handleSort = (sortBy: ReceivableSortBy) => {
    setFilters((current) => {
      if (current.sortBy === sortBy) {
        return { ...current, sortOrder: current.sortOrder === 'asc' ? 'desc' : 'asc', page: 1 };
      }
      return { ...current, sortBy, sortOrder: sortBy === 'name' ? 'asc' : 'desc', page: 1 };
    });
  };

  const openPaymentDialog = (item: ReceivableItem) => setCustomerForPayment(item.customer);

  const closePaymentDialogAndRefresh = () => {
    setCustomerForPayment(null);
    void queryClient.invalidateQueries({ queryKey: receivablesQueryKeyPrefix });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Accounts Receivable</h1>
        <p className="mt-1 text-sm text-slate-500">
          Payment standing for every customer — who owes, who pays, and who is falling behind.
        </p>
      </div>

      {isLoading && !data ? (
        <ReceivablesLoadingState />
      ) : isError || !data ? (
        <ReceivablesErrorState
          onRetry={() => {
            void refetch();
          }}
        />
      ) : (
        <>
          <ReceivablesSummaryCards summary={data.summary} />
          <ReceivablesFilters
            filters={filters}
            tierCounts={data.tierCounts ?? emptyTierCounts}
            onChange={setFilters}
          />

          {data.items.length === 0 ? (
            <ReceivablesEmptyState
              filtered={hasActiveReceivableFilters(filters)}
              onClearFilters={() => setFilters(resetReceivableFilters(filters))}
            />
          ) : (
            <ReceivablesTable
              items={data.items}
              canMutate={canMutate}
              sortBy={filters.sortBy ?? 'standing'}
              sortOrder={filters.sortOrder ?? 'desc'}
              expandedRows={expandedRows}
              onToggleRow={toggleRow}
              onSort={handleSort}
              onRecordPayment={openPaymentDialog}
            />
          )}

          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Page {data.pagination.page} of {Math.max(data.pagination.totalPages, 1)} ·{' '}
              {data.pagination.total} customer{data.pagination.total === 1 ? '' : 's'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => goToPage(Math.max(1, data.pagination.page - 1))}
                disabled={data.pagination.page <= 1}
                className="inline-flex items-center rounded-md border border-slate-200 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                Previous
              </button>
              <button
                type="button"
                onClick={() =>
                  goToPage(Math.min(data.pagination.totalPages, data.pagination.page + 1))
                }
                disabled={data.pagination.page >= data.pagination.totalPages}
                className="inline-flex items-center rounded-md border border-slate-200 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </>
      )}

      <Modal
        isOpen={Boolean(customerForPayment)}
        onClose={() => setCustomerForPayment(null)}
        title="Receive payment"
        maxWidth="max-w-3xl"
      >
        {customerForPayment && (
          <GlobalReceivePaymentDialog
            initialCustomer={{
              id: customerForPayment.id,
              name: customerForPayment.name,
              phone: customerForPayment.phone,
            }}
            onSuccess={closePaymentDialogAndRefresh}
          />
        )}
      </Modal>
    </div>
  );
};
