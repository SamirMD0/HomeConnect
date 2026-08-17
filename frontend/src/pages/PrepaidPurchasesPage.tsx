import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, HandCoins } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../hooks/useAuth';
import { isFinancialAdmin } from '../features/customer-financial/utils/financial-auth';
import { PrepaidFilters } from '../features/prepaid/components/PrepaidFilters';
import { PrepaidSummaryCards } from '../features/prepaid/components/PrepaidSummaryCards';
import { PrepaidTable } from '../features/prepaid/components/PrepaidTable';
import {
  PrepaidEmptyState,
  PrepaidErrorState,
  PrepaidLoadingState,
} from '../features/prepaid/components/PrepaidStates';
import { DeliverPrepaidDialog } from '../features/prepaid/components/DeliverPrepaidDialog';
import { RevertPrepaidDeliveryDialog } from '../features/prepaid/components/RevertPrepaidDeliveryDialog';
import { PrepaidDetailsDialog } from '../features/prepaid/components/PrepaidDetailsDialog';
import { EditPrepaidPurchaseDialog } from '../features/prepaid/components/EditPrepaidPurchaseDialog';
import { RecordDebtPaymentDialog } from '../features/customer-financial/components/RecordDebtPaymentDialog';
import { CancelDebtDialog } from '../features/customer-financial/components/CancelDebtDialog';
import { usePrepaidPurchases } from '../features/prepaid/hooks/usePrepaidPurchases';
import {
  PrepaidFilters as PrepaidFiltersType,
  PrepaidPurchase,
} from '../features/prepaid/types/prepaid.types';
import { defaultPrepaidFilters } from '../features/prepaid/utils/prepaid-query';
import { toPrepaidPaymentTarget } from '../features/prepaid/utils/prepaid-payment-target';
import { businessLabels } from '../shared/labels/business-labels';

export const PrepaidPurchasesPage: React.FC = () => {
  const { user } = useAuth();
  const canMutate = isFinancialAdmin(user?.role);

  const [filters, setFilters] = useState<PrepaidFiltersType>({ ...defaultPrepaidFilters });
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [deliverTarget, setDeliverTarget] = useState<PrepaidPurchase | null>(null);
  const [revertTarget, setRevertTarget] = useState<PrepaidPurchase | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<PrepaidPurchase | null>(null);
  const [editTarget, setEditTarget] = useState<PrepaidPurchase | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<PrepaidPurchase | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PrepaidPurchase | null>(null);

  const { data, isLoading, isError, refetch } = usePrepaidPurchases(filters);

  const goToPage = (page: number) => setFilters((current) => ({ ...current, page }));

  const closeDialogs = () => {
    setDeliverTarget(null);
    setRevertTarget(null);
    setDetailsTarget(null);
    setEditTarget(null);
    setPaymentTarget(null);
    setCancelTarget(null);
  };

  const finishMutation = () => {
    closeDialogs();
    void refetch();
  };

  const openFromDetails = (
    target: PrepaidPurchase,
    setter: React.Dispatch<React.SetStateAction<PrepaidPurchase | null>>
  ) => {
    setDetailsTarget(null);
    setter(target);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HandCoins className="h-6 w-6 text-emerald-600" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              {businessLabels.prepaid.title}
            </h1>
            <p className="text-sm text-slate-500">
              Items paid for but not yet handed to the customer. The amount shown is what the
              business owes.
            </p>
          </div>
        </div>
      </div>

      {isLoading && <PrepaidLoadingState />}
      {isError && <PrepaidErrorState onRetry={() => refetch()} />}

      {data && (
        <>
          <PrepaidSummaryCards summary={data.summary} />
          <PrepaidFilters filters={filters} onChange={setFilters} />

          {data.items.length === 0 ? (
            <PrepaidEmptyState />
          ) : (
            <PrepaidTable
              items={data.items}
              canMutate={canMutate}
              openMenuKey={openMenuKey}
              onOpenMenuChange={setOpenMenuKey}
              onDeliver={setDeliverTarget}
              onRevertDelivery={setRevertTarget}
              onViewDetails={setDetailsTarget}
              onEdit={setEditTarget}
              onRecordPayment={setPaymentTarget}
              onCancel={setCancelTarget}
            />
          )}

          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Page {data.pagination.page} of {Math.max(1, data.pagination.totalPages)} ·{' '}
              {data.pagination.total} record{data.pagination.total === 1 ? '' : 's'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => goToPage(Math.max(1, data.pagination.page - 1))}
                disabled={data.pagination.page <= 1}
                className="inline-flex items-center rounded-md border border-slate-200 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous / السابق
              </button>
              <button
                type="button"
                onClick={() =>
                  goToPage(Math.min(data.pagination.totalPages, data.pagination.page + 1))
                }
                disabled={data.pagination.page >= data.pagination.totalPages}
                className="inline-flex items-center rounded-md border border-slate-200 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next / التالي
                <ChevronRight className="ml-1 h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}

      <Modal
        isOpen={Boolean(deliverTarget)}
        onClose={closeDialogs}
        title={businessLabels.prepaid.markDelivered}
        maxWidth="max-w-lg"
      >
        {deliverTarget && (
          <DeliverPrepaidDialog item={deliverTarget} onSuccess={closeDialogs} />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(revertTarget)}
        onClose={closeDialogs}
        title={businessLabels.prepaid.revertDelivery}
        maxWidth="max-w-lg"
      >
        {revertTarget && (
          <RevertPrepaidDeliveryDialog item={revertTarget} onSuccess={closeDialogs} />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(detailsTarget)}
        onClose={closeDialogs}
        title={businessLabels.prepaid.viewDetails}
        maxWidth="max-w-lg"
      >
        {detailsTarget && (
          <PrepaidDetailsDialog
            item={detailsTarget}
            canMutate={canMutate}
            onEdit={() => openFromDetails(detailsTarget, setEditTarget)}
            onRecordPayment={() => openFromDetails(detailsTarget, setPaymentTarget)}
            onCancel={() => openFromDetails(detailsTarget, setCancelTarget)}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(editTarget)}
        onClose={closeDialogs}
        title={businessLabels.prepaid.editPurchase}
        maxWidth="max-w-lg"
      >
        {editTarget && (
          <EditPrepaidPurchaseDialog item={editTarget} onSuccess={finishMutation} />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(paymentTarget)}
        onClose={closeDialogs}
        title={businessLabels.prepaid.recordPayment}
        maxWidth="max-w-lg"
      >
        {paymentTarget && (
          <RecordDebtPaymentDialog
            customerId={paymentTarget.customer.id}
            debt={toPrepaidPaymentTarget(paymentTarget)}
            contextVariant="prepaid"
            onSuccess={finishMutation}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(cancelTarget)}
        onClose={closeDialogs}
        title={businessLabels.prepaid.cancelPurchase}
        maxWidth="max-w-lg"
      >
        {cancelTarget && (
          <CancelDebtDialog
            customerId={cancelTarget.customer.id}
            debt={toPrepaidPaymentTarget(cancelTarget)}
            onSuccess={finishMutation}
          />
        )}
      </Modal>
    </div>
  );
};

export default PrepaidPurchasesPage;
