import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LedgerFilters } from './LedgerFilters';
import { LedgerSummaryCards } from './LedgerSummaryCards';
import { LedgerTable } from './LedgerTable';
import { LedgerEmptyState, LedgerErrorState, LedgerLoadingState } from './LedgerStates';
import { FinancialLedgerItem } from '../types/financial-ledger.types';

const items: FinancialLedgerItem[] = [
  {
    type: 'DEBT',
    id: 'debt-1',
    customer: { id: 'customer-1', name: 'Ali Ahmad', phone: '70123456' },
    description: 'Television',
    originalAmount: '600.00',
    totalPaid: '200.00',
    remainingBalance: '400.00',
    dueDate: '2026-08-10',
    status: 'PARTIALLY_PAID',
    storedStatus: 'PARTIALLY_PAID',
    notes: null,
    createdAt: '2026-07-24T09:00:00.000Z',
    updatedAt: '2026-07-24T09:00:00.000Z',
    cancellation: null,
  },
  {
    type: 'INSTALLMENT_PLAN',
    id: 'plan-1',
    customer: { id: 'customer-1', name: 'Ali Ahmad', phone: '70123456' },
    description: 'Refrigerator',
    totalAmount: '600.00',
    totalPaid: '150.00',
    remainingBalance: '450.00',
    startDate: '2026-08-01',
    installmentCount: 6,
    frequency: 'MONTHLY',
    completedInstallmentCount: 1,
    overdueInstallmentCount: 0,
    nextDueDate: '2026-09-01',
    status: 'ACTIVE',
    storedStatus: 'ACTIVE',
    notes: null,
    createdAt: '2026-07-24T09:00:00.000Z',
    updatedAt: '2026-07-24T09:00:00.000Z',
    cancellation: null,
    scheduleSummary: {
      totalInstallments: 6,
      completedInstallments: 1,
      remainingInstallments: 5,
      nextInstallment: {
        id: 'installment-2',
        installmentNumber: 2,
        dueDate: '2026-09-01',
        remainingAmount: '50.00',
        status: 'PARTIALLY_PAID',
      },
    },
  },
  {
    type: 'PAYMENT',
    id: 'payment-1',
    customer: { id: 'customer-1', name: 'Ali Ahmad', phone: '70123456' },
    amount: '150.00',
    paymentDate: '2026-08-15',
    paymentMethod: 'CASH',
    status: 'COMPLETED',
    reference: 'receipt-1',
    notes: null,
    idempotencyKey: null,
    createdAt: '2026-08-15T10:00:00.000Z',
    voidedAt: null,
    allocations: [
      {
        id: 'allocation-1',
        targetType: 'INSTALLMENT',
        debtId: null,
        installmentId: 'installment-1',
        planId: 'plan-1',
        description: 'Refrigerator',
        amount: '100.00',
        createdAt: '2026-08-15T10:00:00.000Z',
      },
      {
        id: 'allocation-2',
        targetType: 'INSTALLMENT',
        debtId: null,
        installmentId: 'installment-2',
        planId: 'plan-1',
        description: 'Refrigerator',
        amount: '50.00',
        createdAt: '2026-08-15T10:00:01.000Z',
      },
    ],
  },
];

describe('financial ledger components', () => {
  it('renders global summary cards', () => {
    const html = renderToStaticMarkup(
      <LedgerSummaryCards
        summary={{
          totalOutstanding: '850.00',
          totalPaid: '350.00',
          activeDebtCount: 1,
          activePlanCount: 1,
          overdueDebtCount: 1,
          overdueInstallmentCount: 2,
        }}
      />
    );

    expect(html).toContain('$850.00');
    expect(html).toContain('$350.00');
    expect(html).toContain('Overdue Items');
    expect(html).toContain('3');
  });

  it('renders debt, plan, and payment rows once without edit or delete actions', () => {
    const html = renderToStaticMarkup(
      <LedgerTable
        items={items}
        canMutate
        onViewDebt={() => undefined}
        onViewPlan={() => undefined}
        onRecordDebtPayment={() => undefined}
        onCancelDebt={() => undefined}
        onRecordPlanPayment={() => undefined}
        onCancelPlan={() => undefined}
      />
    );

    expect(html).toContain('Television');
    expect(html).toContain('Refrigerator');
    expect(html.match(/Completed/g)).toHaveLength(1);
    expect(html).toContain('$400.00');
    expect(html).toContain('$450.00');
    expect(html).not.toContain('Edit');
    expect(html).not.toContain('Delete');
    expect(html).not.toContain('Trash');
  });

  it('hides mutation actions for read-only users', () => {
    const html = renderToStaticMarkup(
      <LedgerTable
        items={items}
        canMutate={false}
        onViewDebt={() => undefined}
        onViewPlan={() => undefined}
        onRecordDebtPayment={() => undefined}
        onCancelDebt={() => undefined}
        onRecordPlanPayment={() => undefined}
        onCancelPlan={() => undefined}
      />
    );

    expect(html).not.toContain('Payment</button>');
    expect(html).not.toContain('Cancel</button>');
    expect(html).toContain('View');
  });

  it('renders filters and operational states', () => {
    const filtersHtml = renderToStaticMarkup(
      <LedgerFilters filters={{ type: 'ALL' }} onChange={() => undefined} />
    );
    const loadingHtml = renderToStaticMarkup(<LedgerLoadingState />);
    const errorHtml = renderToStaticMarkup(<LedgerErrorState onRetry={() => undefined} />);
    const emptyHtml = renderToStaticMarkup(<LedgerEmptyState filtered />);

    expect(filtersHtml).toContain('Customer search');
    expect(filtersHtml).toContain('Paid / Completed');
    expect(loadingHtml).toContain('animate-pulse');
    expect(errorHtml).toContain('Ledger failed to load');
    expect(emptyHtml).toContain('No matching financial records');
  });
});
