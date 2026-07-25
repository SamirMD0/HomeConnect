import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { useAuth } from '../../../hooks/useAuth';
import { useCustomerFinancialSummary } from '../hooks/useCustomerFinancialSummary';
import {
  CustomerFinancialSummary,
  DebtDetail,
  DebtSummaryItem,
  InstallmentPlanDetail,
  InstallmentPlanSummaryItem,
} from '../types/customer-financial.types';
import { isFinancialAdmin } from '../utils/financial-auth';
import { AddFinancialObligationDialog } from './AddFinancialObligationDialog';
import { CancelDebtDialog } from './CancelDebtDialog';
import { CancelInstallmentPlanDialog } from './CancelInstallmentPlanDialog';
import { CustomerDebtsList } from './CustomerDebtsList';
import { DebtDetails } from './DebtDetails';
import { FinancialEmptyState } from './FinancialEmptyState';
import { FinancialErrorState } from './FinancialErrorState';
import { FinancialLoadingState } from './FinancialLoadingState';
import { FinancialSummaryCards } from './FinancialSummaryCards';
import { InstallmentPlanDetails } from './InstallmentPlanDetails';
import { InstallmentPlansList } from './InstallmentPlansList';
import { NextDueCard } from './NextDueCard';
import { OverdueItemsList } from './OverdueItemsList';
import { RecentPaymentsList } from './RecentPaymentsList';
import { RecordDebtPaymentDialog } from './RecordDebtPaymentDialog';
import { RecordPlanPaymentDialog } from './RecordPlanPaymentDialog';

type FinancialProfileTab = 'overview' | 'debts' | 'plans' | 'payments' | 'overdue' | 'legacy';

interface CustomerFinancialProfileProps {
  customerId: string;
  legacyLedger: React.ReactNode;
}

const tabs: Array<{ id: FinancialProfileTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'debts', label: 'Debts' },
  { id: 'plans', label: 'Installment Plans' },
  { id: 'payments', label: 'Payments' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'legacy', label: 'Legacy Ledger' },
];

export const CustomerFinancialProfile: React.FC<CustomerFinancialProfileProps> = ({
  customerId,
  legacyLedger,
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<FinancialProfileTab>('overview');
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [debtForPayment, setDebtForPayment] = useState<DebtSummaryItem | DebtDetail | null>(null);
  const [debtForCancellation, setDebtForCancellation] = useState<DebtSummaryItem | DebtDetail | null>(
    null
  );
  const [planForPayment, setPlanForPayment] = useState<
    InstallmentPlanSummaryItem | InstallmentPlanDetail | null
  >(null);
  const [planForCancellation, setPlanForCancellation] = useState<
    InstallmentPlanSummaryItem | InstallmentPlanDetail | null
  >(null);
  const { data, isLoading, isError, error, refetch } = useCustomerFinancialSummary(customerId, {
    includeCancelled,
    includePayments: true,
    paymentLimit: 20,
    debtLimit: 50,
    planLimit: 50,
  });
  const canMutateFinancialRecords = isFinancialAdmin(user?.role);

  if (isLoading) {
    return <FinancialLoadingState />;
  }

  if (isError || !data) {
    return (
      <FinancialErrorState
        title={getErrorTitle(error)}
        message={getErrorMessage(error)}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const hasNoFinancialData =
    data.debts.length === 0 &&
    data.installmentPlans.length === 0 &&
    data.recentPayments.length === 0 &&
    data.overdueItems.length === 0 &&
    !data.nextDue;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Financial Profile</h2>
          <p className="mt-1 text-sm text-slate-500">Current balances, obligations, and payments.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canMutateFinancialRecords && (
            <button
              type="button"
              onClick={() => setIsAddDialogOpen(true)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              Add financial obligation
            </button>
          )}
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={includeCancelled}
              onChange={(event) => setIncludeCancelled(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            Show cancelled records
          </label>
        </div>
      </div>

      <FinancialSummaryCards summary={data.summary} />

      {hasNoFinancialData && (
        <FinancialEmptyState
          title="No financial obligations"
          description="This customer has no debts, installment plans, overdue items, or payment history."
        />
      )}

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto border-b border-slate-200 px-4">
          <div className="flex min-w-max gap-6" role="tablist" aria-label="Customer financial sections">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <FinancialTabPanel
            activeTab={activeTab}
            data={data}
            onOpenDebt={setSelectedDebtId}
            onOpenPlan={setSelectedPlanId}
            legacyLedger={legacyLedger}
            canMutate={canMutateFinancialRecords}
            onRecordDebtPayment={setDebtForPayment}
            onCancelDebt={setDebtForCancellation}
            onRecordPlanPayment={setPlanForPayment}
            onCancelPlan={setPlanForCancellation}
          />
        </div>
      </div>

      <Modal
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        title="Add financial obligation"
        maxWidth="max-w-3xl"
      >
        <AddFinancialObligationDialog
          customer={data.customer}
          onSuccess={() => setIsAddDialogOpen(false)}
        />
      </Modal>

      <Modal
        isOpen={Boolean(selectedDebtId)}
        onClose={() => setSelectedDebtId(null)}
        title="Debt details"
        maxWidth="max-w-4xl"
      >
        <DebtDetails
          debtId={selectedDebtId}
          canMutate={canMutateFinancialRecords}
          onRecordPayment={setDebtForPayment}
          onCancelDebt={setDebtForCancellation}
        />
      </Modal>

      <Modal
        isOpen={Boolean(selectedPlanId)}
        onClose={() => setSelectedPlanId(null)}
        title="Installment plan details"
        maxWidth="max-w-5xl"
      >
        <InstallmentPlanDetails
          planId={selectedPlanId}
          canMutate={canMutateFinancialRecords}
          onRecordPayment={setPlanForPayment}
          onCancelPlan={setPlanForCancellation}
        />
      </Modal>

      <Modal
        isOpen={Boolean(debtForPayment)}
        onClose={() => setDebtForPayment(null)}
        title="Record debt payment"
        maxWidth="max-w-2xl"
      >
        {debtForPayment && (
          <RecordDebtPaymentDialog
            customerId={customerId}
            debt={debtForPayment}
            onSuccess={() => setDebtForPayment(null)}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(debtForCancellation)}
        onClose={() => setDebtForCancellation(null)}
        title="Cancel debt"
        maxWidth="max-w-xl"
      >
        {debtForCancellation && (
          <CancelDebtDialog
            customerId={customerId}
            debt={debtForCancellation}
            onSuccess={() => setDebtForCancellation(null)}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(planForPayment)}
        onClose={() => setPlanForPayment(null)}
        title="Record installment payment"
        maxWidth="max-w-2xl"
      >
        {planForPayment && (
          <RecordPlanPaymentDialog
            customerId={customerId}
            plan={planForPayment}
            onSuccess={() => setPlanForPayment(null)}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(planForCancellation)}
        onClose={() => setPlanForCancellation(null)}
        title="Cancel installment plan"
        maxWidth="max-w-xl"
      >
        {planForCancellation && (
          <CancelInstallmentPlanDialog
            customerId={customerId}
            plan={planForCancellation}
            onSuccess={() => setPlanForCancellation(null)}
          />
        )}
      </Modal>
    </div>
  );
};

interface FinancialTabPanelProps {
  activeTab: FinancialProfileTab;
  data: CustomerFinancialSummary;
  onOpenDebt: (debtId: string) => void;
  onOpenPlan: (planId: string) => void;
  legacyLedger: React.ReactNode;
  canMutate: boolean;
  onRecordDebtPayment: (debt: DebtSummaryItem) => void;
  onCancelDebt: (debt: DebtSummaryItem) => void;
  onRecordPlanPayment: (plan: InstallmentPlanSummaryItem) => void;
  onCancelPlan: (plan: InstallmentPlanSummaryItem) => void;
}

const FinancialTabPanel: React.FC<FinancialTabPanelProps> = ({
  activeTab,
  data,
  onOpenDebt,
  onOpenPlan,
  legacyLedger,
  canMutate,
  onRecordDebtPayment,
  onCancelDebt,
  onRecordPlanPayment,
  onCancelPlan,
}) => {
  if (activeTab === 'debts') {
    return (
      <CustomerDebtsList
        debts={data.debts}
        onOpenDebt={onOpenDebt}
        canMutate={canMutate}
        onRecordPayment={onRecordDebtPayment}
        onCancelDebt={onCancelDebt}
      />
    );
  }

  if (activeTab === 'plans') {
    return (
      <InstallmentPlansList
        plans={data.installmentPlans}
        onOpenPlan={onOpenPlan}
        canMutate={canMutate}
        onRecordPayment={onRecordPlanPayment}
        onCancelPlan={onCancelPlan}
      />
    );
  }

  if (activeTab === 'payments') {
    return <RecentPaymentsList payments={data.recentPayments} />;
  }

  if (activeTab === 'overdue') {
    return (
      <OverdueItemsList
        items={data.overdueItems}
        onOpenDebt={onOpenDebt}
        onOpenPlan={onOpenPlan}
      />
    );
  }

  if (activeTab === 'legacy') {
    return (
      <section aria-labelledby="legacy-ledger-heading">
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <h2 id="legacy-ledger-heading" className="font-semibold">
            Legacy transaction ledger
          </h2>
          <p className="mt-1">
            This section is kept for existing transaction history. It is not included in the financial-summary totals.
          </p>
        </div>
        {legacyLedger}
      </section>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <div className="space-y-6">
        <NextDueCard nextDue={data.nextDue} onOpenDebt={onOpenDebt} onOpenPlan={onOpenPlan} />
        <OverdueItemsList
          items={data.overdueItems}
          onOpenDebt={onOpenDebt}
          onOpenPlan={onOpenPlan}
        />
      </div>
      <RecentPaymentsList payments={data.recentPayments} />
    </div>
  );
};

function getErrorTitle(error: unknown): string {
  if (isAxiosLikeStatus(error, 404)) return 'Customer not found';
  if (isAxiosLikeStatus(error, 403)) return 'Permission denied';
  return 'Financial profile failed to load';
}

function getErrorMessage(error: unknown): string {
  if (isAxiosLikeStatus(error, 404)) {
    return 'The customer financial profile could not be found.';
  }
  if (isAxiosLikeStatus(error, 403)) {
    return 'You do not have permission to view this customer financial profile.';
  }
  return 'Check the connection and try again.';
}

function isAxiosLikeStatus(error: unknown, status: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: { status?: number } }).response?.status === 'number' &&
    (error as { response?: { status?: number } }).response?.status === status
  );
}
