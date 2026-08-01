import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  applyLedgerStatusFilter,
  countActiveAdvancedLedgerFilters,
  applyLedgerMonthFilter,
  getLedgerMonthFilterValue,
  hasActiveLedgerFilters,
  LedgerFilters,
  resetLedgerFilters,
} from './LedgerFilters';
import { LedgerSummaryCards } from './LedgerSummaryCards';
import { LedgerTable } from './LedgerTable';
import { buildPaymentChildView } from './LedgerPaymentChildRows';
import { LedgerEmptyState, LedgerErrorState, LedgerLoadingState } from './LedgerStates';
import { RecentFinancialPayment } from '../../customer-financial/types/customer-financial.types';
import {
  FinancialLedgerDebtItem,
  FinancialLedgerItem,
  FinancialLedgerPlanItem,
} from '../types/financial-ledger.types';

const items: FinancialLedgerItem[] = [
  {
    type: 'DEBT',
    kind: 'STANDARD',
    id: 'debt-1',
    customer: { id: 'customer-1', name: 'Ali Ahmad', phone: '70123456' },
    description: 'Television',
    originalAmount: '600.00',
    totalPaid: '200.00',
    remainingBalance: '400.00',
    adminDebt: '0.00',
    dueDate: '2026-08-10',
    status: 'PARTIALLY_PAID',
    storedStatus: 'PARTIALLY_PAID',
    notes: null,
    createdAt: '2026-07-24T09:00:00.000Z',
    updatedAt: '2026-07-24T09:00:00.000Z',
    cancellation: null,
    correction: {
      hasCorrections: true,
      correctionCount: 1,
      lastCorrectedAt: '2026-08-20T11:00:00.000Z',
    },
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
    periodSummary: null,
    correction: {
      hasCorrections: false,
      correctionCount: 0,
      lastCorrectedAt: null,
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
    correction: {
      hasCorrections: false,
      correctionCount: 0,
      lastCorrectedAt: null,
    },
  },
];

describe('financial ledger components', () => {
  it('renders global summary cards', () => {
    const html = renderToStaticMarkup(
      <LedgerSummaryCards
        summary={{
          totalOutstanding: '850.00',
          basis: 'filtered',
          totalPaid: '350.00',
          activeDebtCount: 1,
          activePlanCount: 1,
          activeCustomerCount: 1,
          overdueDebtCount: 1,
          overdueInstallmentCount: 2,
        }}
      />
    );

    expect(html).toContain('$850.00');
    expect(html).toContain('$350.00');
    expect(html).toContain('Customers');
    expect(html).toContain('Overdue');
    expect(html).toContain('3');
    expect(html.match(/Current filters/g)).toHaveLength(6);
    // Prepaid moved to its own section; the ledger no longer surfaces it.
    expect(html).not.toContain('Pre-paid');
  });

  it('renders debt, plan, and payment rows in the compact ledger table structure', () => {
    const html = renderToStaticMarkup(
      <LedgerTable
        items={items}
        canMutate
        onViewDebt={() => undefined}
        onViewPlan={() => undefined}
        onEditDebt={() => undefined}
        onEditPlan={() => undefined}
        onRecordDebtPayment={() => undefined}
        onCancelDebt={() => undefined}
        onRecordPlanPayment={() => undefined}
        onCancelPlan={() => undefined}
        onVoidPayment={() => undefined}
      />
    );

    expect(html).toContain('Television');
    expect(html).toContain('Refrigerator');
    expect(html).toContain('Partial');
    expect(html).toContain('Plan · 1 of 6');
    expect(html).toContain('Installment Payment');
    expect(html).toContain('Completed');
    expect(html).toContain('Amount');
    expect(html).toContain('Remaining');
    expect(html).toContain('Financial Ledger / دفتر الحسابات');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Show payments for Ali Ahmad - Television');
    expect(html).toContain('Payments');
    expect(html).toContain('md:hidden');
    expect(html).toContain('Corrected');
    expect(html).toContain('Edit');
    expect(html).toContain('$400.00');
    expect(html).toContain('$450.00');
    expect(html).not.toContain('Correct record');
    expect(html).not.toContain('Delete');
    expect(html).not.toContain('Trash');
  });

  it('renders Arabic customer and obligation text with automatic direction', () => {
    const html = renderToStaticMarkup(
      <LedgerTable
        items={[
          {
            ...(items[0] as FinancialLedgerDebtItem),
            customer: { ...(items[0] as FinancialLedgerDebtItem).customer, name: 'علي الحاج' },
            description: 'ثلاجة سامسونج',
          },
        ]}
        canMutate
        onViewDebt={() => undefined}
        onViewPlan={() => undefined}
        onEditDebt={() => undefined}
        onEditPlan={() => undefined}
        onRecordDebtPayment={() => undefined}
        onCancelDebt={() => undefined}
        onRecordPlanPayment={() => undefined}
        onCancelPlan={() => undefined}
        onVoidPayment={() => undefined}
      />
    );

    expect(html).toContain('علي الحاج');
    expect(html).toContain('ثلاجة سامسونج');
    expect(html).toContain('dir="auto"');
    expect(html).toContain('user-text');
  });

  it('renders unknown ledger obligation statuses instead of crashing', () => {
    const html = renderToStaticMarkup(
      <LedgerTable
        items={[
          { ...items[0], status: 'WRITTEN_OFF' as never },
          { ...items[1], status: 'PAUSED' as never },
        ]}
        canMutate
        onViewDebt={() => undefined}
        onViewPlan={() => undefined}
        onEditDebt={() => undefined}
        onEditPlan={() => undefined}
        onRecordDebtPayment={() => undefined}
        onCancelDebt={() => undefined}
        onRecordPlanPayment={() => undefined}
        onCancelPlan={() => undefined}
        onVoidPayment={() => undefined}
      />
    );

    expect(html).toContain('Written Off');
    expect(html).toContain('Paused');
  });

  it('renders plan month period amounts instead of full plan totals when present', () => {
    const html = renderToStaticMarkup(
      <LedgerTable
        items={[
          {
            ...(items[1] as FinancialLedgerPlanItem),
            periodSummary: {
              dueFrom: '2026-08-01',
              dueTo: '2026-08-31',
              installmentCount: 1,
              totalDue: '100.00',
              totalPaid: '40.00',
              totalRemaining: '60.00',
            },
          },
        ]}
        canMutate
        onViewDebt={() => undefined}
        onViewPlan={() => undefined}
        onEditDebt={() => undefined}
        onEditPlan={() => undefined}
        onRecordDebtPayment={() => undefined}
        onCancelDebt={() => undefined}
        onRecordPlanPayment={() => undefined}
        onCancelPlan={() => undefined}
        onVoidPayment={() => undefined}
      />
    );

    expect(html).toContain('Plan · 1 this month');
    expect(html).toContain('$100.00');
    expect(html).toContain('$60.00');
    expect(html).not.toContain('$600.00');
    expect(html).not.toContain('$450.00');
  });

  it('hides mutation actions for read-only users', () => {
    const html = renderToStaticMarkup(
      <LedgerTable
        items={items}
        canMutate={false}
        onViewDebt={() => undefined}
        onViewPlan={() => undefined}
        onEditDebt={() => undefined}
        onEditPlan={() => undefined}
        onRecordDebtPayment={() => undefined}
        onCancelDebt={() => undefined}
        onRecordPlanPayment={() => undefined}
        onCancelPlan={() => undefined}
        onVoidPayment={() => undefined}
      />
    );

    expect(html).not.toContain('Record payment');
    expect(html).not.toContain('Cancel debt');
    expect(html).not.toContain('Void payment');
    expect(html).toContain('Open row actions');
  });

  it('renders the redesigned filter tier and operational states', () => {
    const filtersHtml = renderToStaticMarkup(
      <LedgerFilters
        filters={{
          type: 'ALL',
          includeCompleted: true,
          status: 'CANCELLED',
          includeCancelled: true,
          correctedOnly: true,
          dueFrom: '2026-08-01',
          dueTo: '2026-08-31',
          paymentFrom: '2026-08-01',
          paymentTo: '2026-08-31',
        }}
        onChange={() => undefined}
      />
    );
    const loadingHtml = renderToStaticMarkup(<LedgerLoadingState />);
    const errorHtml = renderToStaticMarkup(<LedgerErrorState onRetry={() => undefined} />);
    const emptyHtml = renderToStaticMarkup(
      <LedgerEmptyState filtered canIncludeCompleted onIncludeCompleted={() => undefined} />
    );

    expect(filtersHtml).toContain('Ledger View');
    expect(filtersHtml).toContain('دفتر الحسابات');
    expect(filtersHtml).toContain('Customer Search');
    expect(filtersHtml).toContain('Include Completed');
    expect(filtersHtml).toContain('إظهار المكتمل');
    expect(filtersHtml).toContain('Hidden by default');
    expect(filtersHtml).toContain('More Filters (4)');
    expect(filtersHtml).toContain('Clear');
    expect(loadingHtml).toContain('animate-pulse');
    expect(errorHtml).toContain('Ledger failed to load');
    expect(emptyHtml).toContain('No matching financial records');
    expect(emptyHtml).toContain('Include completed');
  });

  it('applies ledger filter behavior without coupling the overdue tab to status', () => {
    const currentFilters = {
      type: 'OVERDUE' as const,
      status: 'ACTIVE' as const,
      includeCancelled: false,
      includeCompleted: true,
      correctedOnly: true,
      search: 'Ali',
      dueFrom: '2026-08-01',
      page: 4,
      limit: 25,
    };

    expect(hasActiveLedgerFilters({ type: 'ALL', includeCompleted: false })).toBe(false);
    expect(hasActiveLedgerFilters(currentFilters)).toBe(true);
    expect(countActiveAdvancedLedgerFilters(currentFilters)).toBe(3);
    expect(applyLedgerStatusFilter(currentFilters, 'CANCELLED')).toMatchObject({
      status: 'CANCELLED',
      includeCancelled: true,
      page: 1,
    });
    expect(resetLedgerFilters(currentFilters)).toMatchObject({
      type: 'ALL',
      status: undefined,
      search: undefined,
      dueFrom: undefined,
      includeCancelled: false,
      includeCompleted: false,
      correctedOnly: false,
      page: 1,
      limit: 25,
    });
  });

  it('maps the advanced month filter to due and payment date ranges', () => {
    const filters = applyLedgerMonthFilter({ page: 3 }, '2026-02');

    expect(filters).toMatchObject({
      dueFrom: '2026-02-01',
      dueTo: '2026-02-28',
      paymentFrom: '2026-02-01',
      paymentTo: '2026-02-28',
      page: 1,
    });
    expect(getLedgerMonthFilterValue(filters)).toBe('2026-02');
    expect(applyLedgerMonthFilter(filters, '')).toMatchObject({
      dueFrom: undefined,
      dueTo: undefined,
      paymentFrom: undefined,
      paymentTo: undefined,
      page: 1,
    });
  });

  it('groups expanded plan payment allocations as one parent-attributed payment view', () => {
    const payment: RecentFinancialPayment = {
      id: 'payment-split',
      totalAmount: '320.00',
      paymentDate: '2026-08-15',
      paymentMethod: 'CASH',
      reference: 'receipt-320',
      notes: 'Split across installments',
      idempotencyKey: null,
      createdAt: '2026-08-15T10:00:00.000Z',
      createdBy: { id: 'user-1', name: 'System Administrator', username: 'admin' },
      voidedAt: null,
      voidReason: null,
      voidedBy: null,
      allocations: [
        {
          id: 'allocation-1',
          targetType: 'INSTALLMENT',
          debtId: null,
          installmentId: 'installment-1',
          planId: 'plan-1',
          description: 'Refrigerator',
          amount: '120.00',
          createdAt: '2026-08-15T10:00:00.000Z',
        },
        {
          id: 'allocation-2',
          targetType: 'INSTALLMENT',
          debtId: null,
          installmentId: 'installment-2',
          planId: 'plan-1',
          description: 'Refrigerator',
          amount: '110.00',
          createdAt: '2026-08-15T10:00:01.000Z',
        },
        {
          id: 'allocation-3',
          targetType: 'INSTALLMENT',
          debtId: null,
          installmentId: 'installment-3',
          planId: 'plan-1',
          description: 'Refrigerator',
          amount: '90.00',
          createdAt: '2026-08-15T10:00:02.000Z',
        },
      ],
    };

    const paymentView = buildPaymentChildView(items[1] as FinancialLedgerPlanItem, payment);

    expect(paymentView.parentAmount).toBe('320.00');
    expect(paymentView.parentAllocations).toHaveLength(3);
    expect(paymentView.showTotalAmount).toBe(false);
    expect(paymentView.showAllocationBreakdown).toBe(true);
  });

  it('attributes split payments to the expanded parent without duplicating the full total', () => {
    const payment: RecentFinancialPayment = {
      id: 'payment-mixed',
      totalAmount: '500.00',
      paymentDate: '2026-08-15',
      paymentMethod: 'BANK_TRANSFER',
      reference: null,
      notes: null,
      idempotencyKey: null,
      createdAt: '2026-08-15T10:00:00.000Z',
      createdBy: { id: 'user-1', name: 'System Administrator', username: 'admin' },
      voidedAt: '2026-08-16T10:00:00.000Z',
      voidReason: 'Wrong customer',
      voidedBy: { id: 'user-1', name: 'System Administrator', username: 'admin' },
      allocations: [
        {
          id: 'allocation-plan',
          targetType: 'INSTALLMENT',
          debtId: null,
          installmentId: 'installment-1',
          planId: 'plan-1',
          description: 'Refrigerator',
          amount: '300.00',
          createdAt: '2026-08-15T10:00:00.000Z',
        },
        {
          id: 'allocation-other-debt',
          targetType: 'DEBT',
          debtId: 'other-debt',
          installmentId: null,
          planId: null,
          description: 'Other debt',
          amount: '200.00',
          createdAt: '2026-08-15T10:00:01.000Z',
        },
      ],
    };

    const paymentView = buildPaymentChildView(items[1] as FinancialLedgerPlanItem, payment);

    expect(paymentView.parentAmount).toBe('300.00');
    expect(paymentView.parentAllocations).toHaveLength(1);
    expect(paymentView.showTotalAmount).toBe(true);
    expect(paymentView.payment.voidReason).toBe('Wrong customer');
  });
});
