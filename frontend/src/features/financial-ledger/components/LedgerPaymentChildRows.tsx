import React from 'react';
import {
  PaymentAllocationSummary,
  RecentFinancialPayment,
} from '../../customer-financial/types/customer-financial.types';
import { formatBusinessDate, formatDateTime, formatMoney } from '../../customer-financial/utils/financial-format';
import { allocationTargetLabels, paymentMethodLabels } from '../../customer-financial/utils/financial-labels';
import {
  FinancialLedgerDebtItem,
  FinancialLedgerPlanItem,
} from '../types/financial-ledger.types';
import { useLedgerRowPayments } from '../hooks/useLedgerRowPayments';

interface LedgerPaymentChildRowsProps {
  item: FinancialLedgerDebtItem | FinancialLedgerPlanItem;
  regionId: string;
}

export const LedgerPaymentChildRows: React.FC<LedgerPaymentChildRowsProps> = ({ item, regionId }) => {
  return (
    <tr className="bg-slate-50/70">
      <td colSpan={10} className="px-4 py-3">
        <LedgerPaymentChildPanel item={item} regionId={regionId} className="border-l-2 border-slate-200 py-2 pl-10 pr-3" />
      </td>
    </tr>
  );
};

export const LedgerPaymentChildPanel: React.FC<{
  item: FinancialLedgerDebtItem | FinancialLedgerPlanItem;
  regionId: string;
  className?: string;
}> = ({ item, regionId, className = '' }) => {
  const { payments, isLoading, isError, refetch } = useLedgerRowPayments(item, true);

  return (
    <div
      id={regionId}
      role="region"
      aria-label={`Payments for ${item.customer.name} - ${item.description}`}
      aria-busy={isLoading}
      className={className}
    >
      {isLoading ? (
        <PaymentChildLoadingState />
      ) : isError ? (
        <PaymentChildErrorState onRetry={refetch} />
      ) : (
        <PaymentChildContent item={item} payments={payments} />
      )}
    </div>
  );
};

const PaymentChildContent: React.FC<{
  item: FinancialLedgerDebtItem | FinancialLedgerPlanItem;
  payments: RecentFinancialPayment[];
}> = ({ item, payments }) => {
  const paymentViews = payments.map((payment) => buildPaymentChildView(item, payment));

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Payments ({paymentViews.length})
      </p>
      {paymentViews.length === 0 ? (
        <div className="flex min-h-12 items-center text-xs text-slate-500">No payments recorded yet.</div>
      ) : (
        <div className="divide-y divide-slate-200/70 rounded-md border border-slate-200 bg-white">
          {paymentViews.map((paymentView) => (
            <PaymentChildCard key={paymentView.payment.id} paymentView={paymentView} />
          ))}
        </div>
      )}
    </div>
  );
};

const PaymentChildCard: React.FC<{ paymentView: LedgerPaymentChildView }> = ({ paymentView }) => {
  const { payment, parentAmount, showTotalAmount, parentAllocations, showAllocationBreakdown } = paymentView;
  const isVoided = Boolean(payment.voidedAt);

  return (
    <div className="px-3 py-2 text-xs">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="min-w-0 text-slate-600">
          <p>
            <span className="font-medium text-slate-900">{formatBusinessDate(payment.paymentDate)}</span>
            <span className="mx-2 text-slate-300">·</span>
            <span>{paymentMethodLabels[payment.paymentMethod]}</span>
            {isVoided && (
              <span className="ml-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 ring-1 ring-amber-600/20">
                Voided
              </span>
            )}
          </p>
          <p className="mt-1 text-slate-500">
            {payment.reference ? `Ref: ${payment.reference} · ` : ''}
            Recorded by {payment.createdBy.name} on {formatDateTime(payment.createdAt)}
          </p>
          {payment.notes && <p className="mt-1 line-clamp-2 text-slate-500">{payment.notes}</p>}
          {payment.voidReason && <p className="mt-1 text-amber-700">Void reason: {payment.voidReason}</p>}
          {showAllocationBreakdown && (
            <ul className="mt-2 space-y-1 border-l border-slate-200 pl-3">
              {parentAllocations.map((allocation) => (
                <li key={allocation.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-slate-500">
                    <span className="font-medium text-slate-700">{allocationLabel(allocation)}</span>
                    {allocation.description && <span> · {allocation.description}</span>}
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900">{formatMoney(allocation.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p
          className={`text-right font-semibold tabular-nums ${
            isVoided ? 'text-slate-400 line-through' : 'text-slate-900'
          }`}
        >
          {formatMoney(parentAmount)}
          {showTotalAmount && (
            <span className="block text-xs font-normal text-slate-500">
              of {formatMoney(payment.totalAmount)} total
            </span>
          )}
        </p>
      </div>
    </div>
  );
};

const PaymentChildLoadingState: React.FC = () => (
  <div className="space-y-2" aria-label="Loading payments">
    <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
    <div className="h-10 animate-pulse rounded bg-slate-200" />
    <div className="h-10 w-2/3 animate-pulse rounded bg-slate-200" />
  </div>
);

const PaymentChildErrorState: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
    <span>Payments could not be loaded.</span>
    <button type="button" onClick={onRetry} className="ml-3 font-semibold underline">
      Retry
    </button>
  </div>
);

interface LedgerPaymentChildView {
  payment: RecentFinancialPayment;
  parentAmount: string;
  parentAllocations: PaymentAllocationSummary[];
  showTotalAmount: boolean;
  showAllocationBreakdown: boolean;
}

export function buildPaymentChildView(
  item: FinancialLedgerDebtItem | FinancialLedgerPlanItem,
  payment: RecentFinancialPayment
): LedgerPaymentChildView {
  const parentAllocations = payment.allocations.filter((allocation) => isAllocationForParent(item, allocation));
  const parentAmount =
    parentAllocations.length > 0
      ? sumMoneyStrings(parentAllocations.map((allocation) => allocation.amount))
      : payment.totalAmount;

  return {
    payment,
    parentAmount,
    parentAllocations,
    showTotalAmount: compareMoneyStrings(parentAmount, payment.totalAmount) !== 0,
    showAllocationBreakdown:
      parentAllocations.length > 1 ||
      parentAllocations.some((allocation) => allocation.targetType === 'INSTALLMENT'),
  };
}

function isAllocationForParent(
  item: FinancialLedgerDebtItem | FinancialLedgerPlanItem,
  allocation: PaymentAllocationSummary
): boolean {
  if (item.type === 'DEBT') return allocation.debtId === item.id;
  return allocation.planId === item.id;
}

function allocationLabel(allocation: PaymentAllocationSummary): string {
  if (allocation.targetType === 'INSTALLMENT') return 'Installment';
  return allocationTargetLabels[allocation.targetType];
}

function sumMoneyStrings(values: string[]): string {
  const cents = values.reduce((total, value) => total + moneyStringToCents(value), 0n);
  return centsToMoneyString(cents);
}

function compareMoneyStrings(left: string, right: string): number {
  const leftCents = moneyStringToCents(left);
  const rightCents = moneyStringToCents(right);
  if (leftCents === rightCents) return 0;
  return leftCents > rightCents ? 1 : -1;
}

function moneyStringToCents(value: string): bigint {
  const trimmed = value.trim();
  const isNegative = trimmed.startsWith('-');
  const unsigned = isNegative ? trimmed.slice(1) : trimmed;
  const [whole = '0', rawFraction = ''] = unsigned.split('.');
  const fraction = rawFraction.padEnd(2, '0').slice(0, 2);
  const cents = BigInt(whole || '0') * 100n + BigInt(fraction || '0');
  return isNegative ? -cents : cents;
}

function centsToMoneyString(cents: bigint): string {
  const isNegative = cents < 0n;
  const absolute = isNegative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${whole.toString()}.${fraction}`;
}
