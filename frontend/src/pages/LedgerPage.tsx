import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, WalletCards, ChevronLeft, ChevronRight } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../hooks/useAuth';
import { DebtDetails } from '../features/customer-financial/components/DebtDetails';
import { EditDebtDialog } from '../features/customer-financial/components/EditDebtDialog';
import { InstallmentPlanDetails } from '../features/customer-financial/components/InstallmentPlanDetails';
import { CancelDebtDialog } from '../features/customer-financial/components/CancelDebtDialog';
import { CancelInstallmentPlanDialog } from '../features/customer-financial/components/CancelInstallmentPlanDialog';
import { EditInstallmentPlanDialog } from '../features/customer-financial/components/EditInstallmentPlanDialog';
import { RecordDebtPaymentDialog } from '../features/customer-financial/components/RecordDebtPaymentDialog';
import { DebtPaymentTarget } from '../features/customer-financial/components/RecordDebtPaymentDialog';
import { RecordPlanPaymentDialog } from '../features/customer-financial/components/RecordPlanPaymentDialog';
import { PlanPaymentTarget } from '../features/customer-financial/components/RecordPlanPaymentDialog';
import { VoidPaymentDialog } from '../features/customer-financial/components/VoidPaymentDialog';
import { DebtDetail, InstallmentPlanDetail } from '../features/customer-financial/types/customer-financial.types';
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
  FinancialLedgerDebtItem,
  FinancialLedgerPaymentItem,
  FinancialLedgerPlanItem,
} from '../features/financial-ledger/types/financial-ledger.types';
import { businessLabels } from '../shared/labels/business-labels';

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
  const [debtForEdit, setDebtForEdit] = useState<DebtDetail | null>(null);
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
    setDebtForEdit(null);
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

  const openDebtEdit = (debt: FinancialLedgerDebtItem) => {
    setSelectedDebtId(null);
    setDebtForEdit(toDebtDetail(debt));
  };

  const openDebtCancellation = (debt: DebtMutationTarget) => {
    setSelectedDebtId(null);
    setDebtForCancellation(debt);
  };

  const openPlanPayment = (plan: PlanMutationTarget) => {
    setSelectedPlanId(null);
    setPlanForPayment(plan);
  };

  const openPlanEdit = (plan: FinancialLedgerPlanItem) => {
    setSelectedPlanId(null);
    setPlanForEdit(toPlanDetail(plan));
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
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{businessLabels.ledger.title}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Global financial view for debts, installment plans, payments, and allocations.
          </p>
        </div>
        {canMutate && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsAddDialogOpen(true)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3.5 text-sm font-semibold text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              <Plus className="h-4 w-4" />
              Add Obligation / إضافة التزام مالي
            </button>
            <button
              type="button"
              onClick={() => setIsReceivePaymentDialogOpen(true)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-emerald-200 bg-white px-3.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              <WalletCards className="h-4 w-4" />
              {businessLabels.financial.receivePayment}
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
                onEditDebt={openDebtEdit}
                onEditPlan={openPlanEdit}
                onRecordDebtPayment={openDebtPayment}
                onCancelDebt={openDebtCancellation}
                onRecordPlanPayment={openPlanPayment}
                onCancelPlan={openPlanCancellation}
                onVoidPayment={setPaymentForVoid}
              />
              {!filters.includeCompleted && (
                <p className="px-1 text-xs text-slate-500">
                  Completed debts and plans are hidden / الديون والخطط المكتملة مخفية. استخدم إظهار المكتمل لعرضها.
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
                Previous / السابق
              </button>
              <button
                type="button"
                onClick={() => goToPage(Math.min(data.pagination.totalPages, data.pagination.page + 1))}
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
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        title="Add Obligation / إضافة التزام مالي"
        maxWidth="max-w-3xl"
      >
        <GlobalAddObligationDialog onSuccess={closeMutationDialogsAndRefresh} />
      </Modal>

      <Modal
        isOpen={isReceivePaymentDialogOpen}
        onClose={() => setIsReceivePaymentDialogOpen(false)}
        title={businessLabels.financial.receivePayment}
        maxWidth="max-w-3xl"
      >
        <GlobalReceivePaymentDialog onSuccess={closeMutationDialogsAndRefresh} />
      </Modal>

      <Modal
        isOpen={Boolean(selectedDebtId)}
        onClose={() => setSelectedDebtId(null)}
        title="Debt Details / تفاصيل الدين"
        maxWidth="max-w-4xl"
      >
        <DebtDetails
          debtId={selectedDebtId}
          canMutate={canMutate}
          onRecordPayment={openDebtPayment}
          onEditDebt={(debt) => {
            setSelectedDebtId(null);
            setDebtForEdit(debt);
          }}
          onCancelDebt={openDebtCancellation}
        />
      </Modal>

      <Modal
        isOpen={Boolean(debtForEdit)}
        onClose={() => setDebtForEdit(null)}
        title="Edit Debt / تعديل الدين"
        maxWidth="max-w-2xl"
      >
        {debtForEdit && (
          <EditDebtDialog
            customerId={debtForEdit.customer.id}
            debt={debtForEdit}
            onSuccess={closeMutationDialogsAndRefresh}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(selectedPlanId)}
        onClose={() => setSelectedPlanId(null)}
        title="Installment Plan Details / تفاصيل خطة التقسيط"
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
        title="Edit Installment Plan / تعديل خطة التقسيط"
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
        title="Record Debt Payment / تسجيل دفعة دين"
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
        title="Cancel Debt / إلغاء الدين"
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
        title="Record Installment Payment / تسجيل دفعة قسط"
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
        title="Cancel Installment Plan / إلغاء خطة التقسيط"
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
        title="Void Payment / إبطال الدفعة"
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

function toDebtDetail(debt: FinancialLedgerDebtItem): DebtDetail {
  return {
    ...debt,
    calculatedStatus: debt.status,
    createdBy: {
      id: 'system',
      name: 'System',
      username: 'system',
    },
    cancellation: debt.cancellation
      ? {
          ...debt.cancellation,
          cancelledBy: null,
        }
      : null,
    payments: [],
  };
}

function toPlanDetail(plan: FinancialLedgerPlanItem): InstallmentPlanDetail {
  return {
    ...plan,
    calculatedStatus: plan.status,
    createdBy: {
      id: 'system',
      name: 'System',
      username: 'system',
    },
    cancellation: plan.cancellation
      ? {
          ...plan.cancellation,
          cancelledBy: null,
        }
      : null,
    schedule: [],
    payments: [],
  };
}
