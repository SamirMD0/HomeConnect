import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { CustomerPrepaidHistory } from './CustomerPrepaidHistory';
import { PrepaidDetailsDialog } from './PrepaidDetailsDialog';
import { PrepaidErrorState, PrepaidLoadingState } from './PrepaidStates';
import { usePrepaidPurchases } from '../hooks/usePrepaidPurchases';
import { PrepaidPurchase } from '../types/prepaid.types';
import { CreatePrepaidPurchaseForm } from '../../customer-financial/components/CreatePrepaidPurchaseForm';
import { RecordDebtPaymentDialog } from '../../customer-financial/components/RecordDebtPaymentDialog';
import { FinancialSummaryCustomer } from '../../customer-financial/types/customer-financial.types';
import { toPrepaidPaymentTarget } from '../utils/prepaid-payment-target';
import { businessLabels } from '../../../shared/labels/business-labels';

interface CustomerPrepaidPanelProps {
  customer: FinancialSummaryCustomer;
  canMutate: boolean;
}

/**
 * The prepaid section of a customer profile. Every prepaid purchase for the
 * customer is listed, so adding another one is an append, and the balance shown
 * is the backend total for the whole set rather than anything derived here.
 */
export const CustomerPrepaidPanel: React.FC<CustomerPrepaidPanelProps> = ({
  customer,
  canMutate,
}) => {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [detailsTarget, setDetailsTarget] = useState<PrepaidPurchase | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<PrepaidPurchase | null>(null);

  const { data, isLoading, isError, refetch } = usePrepaidPurchases({
    customerId: customer.id,
    status: 'ALL',
    sortBy: 'createdAt',
    sortOrder: 'desc',
    page: 1,
    pageSize: 100,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Money received in advance for items not yet handed over / مبالغ مقبوضة مقدماً عن سلع لم
          تُسلّم بعد.
        </p>
        {canMutate && (
          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {businessLabels.prepaid.addBill}
          </button>
        )}
      </div>

      {isLoading && <PrepaidLoadingState />}
      {isError && <PrepaidErrorState onRetry={() => refetch()} />}

      {data && (
        <CustomerPrepaidHistory
          items={data.items}
          summary={data.summary}
          onViewDetails={setDetailsTarget}
          onRecordBill={canMutate ? setPaymentTarget : undefined}
        />
      )}

      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title={businessLabels.prepaid.addBill}
        maxWidth="max-w-2xl"
      >
        <CreatePrepaidPurchaseForm
          customer={customer}
          onBack={() => setIsAddOpen(false)}
          onSuccess={() => {
            setIsAddOpen(false);
            void refetch();
          }}
        />
      </Modal>

      <Modal
        isOpen={Boolean(detailsTarget)}
        onClose={() => setDetailsTarget(null)}
        title={businessLabels.prepaid.viewDetails}
        maxWidth="max-w-lg"
      >
        {detailsTarget && (
          <PrepaidDetailsDialog
            item={detailsTarget}
            canMutate={false}
            onEdit={() => undefined}
            onRecordPayment={() => undefined}
            onCancel={() => undefined}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(paymentTarget)}
        onClose={() => setPaymentTarget(null)}
        title={businessLabels.prepaid.recordPayment}
        maxWidth="max-w-2xl"
      >
        {paymentTarget && (
          <RecordDebtPaymentDialog
            customerId={customer.id}
            debt={toPrepaidPaymentTarget(paymentTarget)}
            contextVariant="prepaid"
            onSuccess={() => {
              setPaymentTarget(null);
              void refetch();
            }}
          />
        )}
      </Modal>
    </div>
  );
};
