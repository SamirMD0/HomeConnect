import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, WalletCards, ChevronLeft, ChevronRight } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../hooks/useAuth';
import { DebtDetails } from '../features/customer-financial/components/DebtDetails';
import { InstallmentPlanDetails } from '../features/customer-financial/components/InstallmentPlanDetails';
import { CancelDebtDialog } from '../features/customer-financial/components/CancelDebtDialog';
import { CancelInstallmentPlanDialog } from '../features/customer-financial/components/CancelInstallmentPlanDialog';
import { EditInstallmentPlanDialog } from '../features/customer-financial/components/EditInstallmentPlanDialog';
import { RecordDebtPaymentDialog } from '../features/customer-financial/components/RecordDebtPaymentDialog';
import { DebtPaymentTarget } from '../features/customer-financial/components/RecordDebtPaymentDialog';
import { RecordPlanPaymentDialog } from '../features/customer-financial/components/RecordPlanPaymentDialog';
import { PlanPaymentTarget } from '../features/customer-financial/components/RecordPlanPaymentDialog';
import { VoidPaymentDialog } from '../features/customer-financial/components/VoidPaymentDialog';
import { InstallmentPlanDetail } from '../features/customer-financial/types/customer-financial.types';
import { isFinancialAdmin } from '../features/customer-financial/utils/financial-auth';
import { GlobalAddObligationDialog } from '../features/financial-ledger/components/GlobalAddObligationDialog';
import { GlobalReceivePaymentDialog } from '../features/financial-ledger/components/GlobalReceivePaymentDialog';
import {
  hasActiveLedgerFilters,
  LedgerFilters,
} from '../features/financial-ledger/components/LedgerFilters';
import { LedgerSummaryCards } from '../features/financial-ledger/components/LedgerSummaryCards';
import { LedgerTable } from '../features/financial-ledger/components/LedgerTable';
import {
  LedgerEmptyState,
  LedgerErrorState,
  LedgerLoadingState,
} from '../features/financial-ledger/components/LedgerStates';
import {
  financialLedgerQueryKeyPrefix,
  useFinancialLedger,
} from '../features/financial-ledger/hooks/useFinancialLedger';
import {
  FinancialLedgerFilters,
  FinancialLedgerPaymentItem,
} from '../features/financial-ledger/types/financial-ledger.types';

type DebtMutationTarget = DebtPaymentTarget & { customer: { id: string } };
type PlanMutationTarget = PlanPaymentTarget & { customer: { id: string } };

export const LedgerPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canMutate = isFinancialAdmin(user?.role);
  const [filters, setFilters] = useState<FinancialLedgerFilters>({
    type: 'ALL',
    page: 1,
    limit: 25,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    includeCancelled: false,
    includeCompleted: false,
    correctedOnly: false,
  });
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isReceivePaymentDialogOpen, setIsReceivePaymentDialogOpen] = useState(false);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [debtForPayment, setDebtForPayment] = useState<DebtMutationTarget | null>(null);
  const [debtForCancellation, setDebtForCancellation] = useState<DebtMutationTarget | null>(null);
  const [planForPayment, setPlanForPayment] = useState<PlanMutationTarget | null>(null);
  const [planForEdit, setPlanForEdit] = useState<InstallmentPlanDetail | null>(null);
  const [planForCancellation, setPlanForCancellation] = useState<PlanMutationTarget | null>(null);
  const [paymentForVoid, setPaymentForVoid] = useState<FinancialLedgerPaymentItem | null>(null);

  const { data, isLoading, isError, refetch } = useFinancialLedger(filters);

  const refreshLedger = () => {
    void queryClient.invalidateQueries({ queryKey: financialLedgerQueryKeyPrefix });
  };

  const closeMutationDialogsAndRefresh = () => {
    setIsAddDialogOpen(false);
    setIsReceivePaymentDialogOpen(false);
    setSelectedDebtId(null);
    setSelectedPlanId(null);
    setDebtForPayment(null);
    setDebtForCancellation(null);
    setPlanForEdit(null);
    setPlanForPayment(null);
    setPlanForCancellation(null);
    setPaymentForVoid(null);
    refreshLedger();
  };

  const openDebtPayment = (debt: DebtMutationTarget) => {
    setSelectedDebtId(null);
    setDebtForPayment(debt);
  };

  const openDebtCancellation = (debt: DebtMutationTarget) => {
    setSelectedDebtId(null);
    setDebtForCancellation(debt);
  };

  const openPlanPayment = (plan: PlanMutationTarget) => {
    setSelectedPlanId(null);
    setPlanForPayment(plan);
  };

  const openPlanCancellation = (plan: PlanMutationTarget) => {
    setSelectedPlanId(null);
    setPlanForCancellation(plan);
  };

  const goToPage = (page: number) => {
    setFilters((current) => ({ ...current, page }));
  };

  const includeCompleted = () => {
    setFilters((current) => ({ ...current, includeCompleted: true, page: 1 }));
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ledger</h1>
          <p className="mt-1 text-sm text-slate-500">
            Global financial view for debts, installment plans, payments, and allocations.
          </p>
        </div>
        {canMutate && (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setIsAddDialogOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              <Plus className="h-4 w-4" />
              Add financial obligation
            </button>
            <button
              type="button"
              onClick={() => setIsReceivePaymentDialogOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              <WalletCards className="h-4 w-4" />
              Receive payment
            </button>
          </div>
        )}
      </div>

      {isLoading && !data ? (
        <LedgerLoadingState />
      ) : isError || !data ? (
        <LedgerErrorState
          onRetry={() => {
            void refetch();
          }}
        />
      ) : (
        <>
          <LedgerSummaryCards summary={data.summary} />
          <LedgerFilters filters={filters} onChange={setFilters} />
          {data.items.length === 0 ? (
            <LedgerEmptyState
              filtered={hasActiveLedgerFilters(filters)}
              canIncludeCompleted={!filters.includeCompleted}
              onIncludeCompleted={includeCompleted}
            />
          ) : (
            <div className="space-y-2">
              <LedgerTable
                items={data.items}
                canMutate={canMutate}
                onViewDebt={setSelectedDebtId}
                onViewPlan={setSelectedPlanId}
                onRecordDebtPayment={openDebtPayment}
                onCancelDebt={openDebtCancellation}
                onRecordPlanPayment={openPlanPayment}
                onCancelPlan={openPlanCancellation}
                onVoidPayment={setPaymentForVoid}
              />
              {!filters.includeCompleted && (
                <p className="px-1 text-xs text-slate-500">
                  Completed debts and plans are hidden. Include completed to show them.
                </p>
              )}
            </div>
          )}
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.total}{' '}
              record{data.pagination.total === 1 ? '' : 's'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => goToPage(Math.max(1, data.pagination.page - 1))}
                disabled={data.pagination.page <= 1}
                className="inline-flex items-center rounded-md border border-slate-200 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </button>
              <button
                type="button"
                onClick={() => goToPage(Math.min(data.pagination.totalPages, data.pagination.page + 1))}
                disabled={data.pagination.page >= data.pagination.totalPages}
                className="inline-flex items-center rounded-md border border-slate-200 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}

      <Modal
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        title="Add financial obligation"
        maxWidth="max-w-3xl"
      >
        <GlobalAddObligationDialog onSuccess={closeMutationDialogsAndRefresh} />
      </Modal>

      <Modal
        isOpen={isReceivePaymentDialogOpen}
        onClose={() => setIsReceivePaymentDialogOpen(false)}
        title="Receive payment"
        maxWidth="max-w-3xl"
      >
        <GlobalReceivePaymentDialog onSuccess={closeMutationDialogsAndRefresh} />
      </Modal>

      <Modal
        isOpen={Boolean(selectedDebtId)}
        onClose={() => setSelectedDebtId(null)}
        title="Debt details"
        maxWidth="max-w-4xl"
      >
        <DebtDetails
          debtId={selectedDebtId}
          canMutate={canMutate}
          onRecordPayment={openDebtPayment}
          onCancelDebt={openDebtCancellation}
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
          canMutate={canMutate}
          onEditPlan={(plan) => {
            setSelectedPlanId(null);
            setPlanForEdit(plan);
          }}
          onRecordPayment={openPlanPayment}
          onCancelPlan={openPlanCancellation}
        />
      </Modal>

      <Modal
        isOpen={Boolean(planForEdit)}
        onClose={() => setPlanForEdit(null)}
        title="Edit installment plan"
        maxWidth="max-w-2xl"
      >
        {planForEdit && (
          <EditInstallmentPlanDialog
            customerId={planForEdit.customer.id}
            plan={planForEdit}
            onSuccess={closeMutationDialogsAndRefresh}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(debtForPayment)}
        onClose={() => setDebtForPayment(null)}
        title="Record debt payment"
        maxWidth="max-w-2xl"
      >
        {debtForPayment && (
          <RecordDebtPaymentDialog
            customerId={debtForPayment.customer.id}
            debt={debtForPayment}
            onSuccess={closeMutationDialogsAndRefresh}
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
            customerId={debtForCancellation.customer.id}
            debt={debtForCancellation}
            onSuccess={closeMutationDialogsAndRefresh}
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
            customerId={planForPayment.customer.id}
            plan={planForPayment}
            onSuccess={closeMutationDialogsAndRefresh}
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
            customerId={planForCancellation.customer.id}
            plan={planForCancellation}
            onSuccess={closeMutationDialogsAndRefresh}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(paymentForVoid)}
        onClose={() => setPaymentForVoid(null)}
        title="Void payment"
        maxWidth="max-w-xl"
      >
        {paymentForVoid && (
          <VoidPaymentDialog
            customerId={paymentForVoid.customer.id}
            payment={{
              id: paymentForVoid.id,
              totalAmount: paymentForVoid.amount,
              paymentDate: paymentForVoid.paymentDate,
              paymentMethod: paymentForVoid.paymentMethod,
              reference: paymentForVoid.reference,
            }}
            sourceScreen="LEDGER"
            onSuccess={closeMutationDialogsAndRefresh}
          />
        )}
      </Modal>
    </div>
  );
};
