import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerFinancialSummary } from '../types/customer-financial.types';
import { AddFinancialObligationDialog } from './AddFinancialObligationDialog';
import { CustomerDebtsList } from './CustomerDebtsList';
import { CustomerFinancialProfile } from './CustomerFinancialProfile';
import { DebtDetails } from './DebtDetails';
import { FinancialStatusBadge } from './FinancialStatusBadge';
import { FinancialSummaryCards } from './FinancialSummaryCards';
import { InstallmentPlanDetails } from './InstallmentPlanDetails';
import { InstallmentPlansList } from './InstallmentPlansList';
import { NextDueCard } from './NextDueCard';
import { OverdueItemsList } from './OverdueItemsList';
import { RecentPaymentsList } from './RecentPaymentsList';

const { authHookMock, debtDetailHookMock, planDetailHookMock, summaryHookMock } = vi.hoisted(() => ({
  authHookMock: vi.fn(),
  debtDetailHookMock: vi.fn(),
  planDetailHookMock: vi.fn(),
  summaryHookMock: vi.fn(),
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: authHookMock,
}));

vi.mock('../hooks/useCustomerFinancialSummary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useCustomerFinancialSummary')>();
  return {
    ...actual,
    useDebtDetail: debtDetailHookMock,
    useInstallmentPlanDetail: planDetailHookMock,
    useCustomerFinancialSummary: summaryHookMock,
  };
});

const summary: CustomerFinancialSummary = {
  customer: {
    id: 'customer-1',
    name: 'Ali Ahmad',
    phone: '70123456',
    address: null,
    notes: null,
    isActive: true,
  },
  summary: {
    totalOutstanding: '850.00',
    singleDebtOutstanding: '400.00',
    installmentPlanOutstanding: '450.00',
    totalPaid: '350.00',
    activeDebtCount: 1,
    activePlanCount: 1,
    overdueDebtCount: 1,
    overdueInstallmentCount: 1,
    nextDueDate: '2026-08-10',
    nextDueAmount: '400.00',
  },
  debts: [
    {
      id: 'debt-1',
      description: 'Television',
      originalAmount: '600.00',
      totalPaid: '200.00',
      remainingBalance: '400.00',
      dueDate: '2026-08-10',
      status: 'PARTIALLY_PAID',
      calculatedStatus: 'PARTIALLY_PAID',
      storedStatus: 'PARTIALLY_PAID',
      notes: null,
      createdAt: '2026-07-24T09:00:00.000Z',
      updatedAt: '2026-07-24T09:00:00.000Z',
      createdBy: { id: 'admin-1', name: 'Admin User', username: 'admin' },
      cancellation: null,
    },
    {
      id: 'debt-2',
      description: 'Cancelled phone',
      originalAmount: '100.00',
      totalPaid: '0.00',
      remainingBalance: '100.00',
      dueDate: '2026-09-10',
      status: 'CANCELLED',
      calculatedStatus: 'CANCELLED',
      storedStatus: 'CANCELLED',
      notes: null,
      createdAt: '2026-07-24T09:00:00.000Z',
      updatedAt: '2026-07-24T09:00:00.000Z',
      createdBy: { id: 'admin-1', name: 'Admin User', username: 'admin' },
      cancellation: {
        cancelledAt: '2026-07-25T09:00:00.000Z',
        reason: 'Returned',
        cancelledBy: { id: 'admin-1', name: 'Admin User', username: 'admin' },
      },
    },
  ],
  installmentPlans: [
    {
      id: 'plan-1',
      description: 'Refrigerator',
      totalAmount: '600.00',
      totalPaid: '150.00',
      remainingBalance: '450.00',
      startDate: '2026-08-01',
      installmentCount: 6,
      frequency: 'MONTHLY',
      completedInstallmentCount: 1,
      overdueInstallmentCount: 1,
      nextDueDate: '2026-08-10',
      status: 'OVERDUE',
      calculatedStatus: 'OVERDUE',
      storedStatus: 'ACTIVE',
      notes: null,
      createdAt: '2026-07-24T09:00:00.000Z',
      updatedAt: '2026-07-24T09:00:00.000Z',
      createdBy: { id: 'admin-1', name: 'Admin User', username: 'admin' },
      cancellation: null,
      scheduleSummary: {
        totalInstallments: 6,
        completedInstallments: 1,
        remainingInstallments: 5,
        nextInstallment: {
          id: 'installment-2',
          installmentNumber: 2,
          dueDate: '2026-08-10',
          remainingAmount: '50.00',
          status: 'PARTIALLY_PAID',
        },
      },
    },
  ],
  overdueItems: [
    {
      type: 'DEBT',
      obligationId: 'debt-old',
      planId: null,
      description: 'Old phone',
      dueDate: '2026-07-01',
      originalDueAmount: '50.00',
      paidAmount: '0.00',
      remainingAmount: '50.00',
      daysOverdue: 23,
      calculatedStatus: 'OVERDUE',
    },
    {
      type: 'INSTALLMENT',
      obligationId: 'installment-1',
      planId: 'plan-1',
      description: 'Refrigerator',
      dueDate: '2026-07-10',
      originalDueAmount: '100.00',
      paidAmount: '50.00',
      remainingAmount: '50.00',
      daysOverdue: 14,
      calculatedStatus: 'OVERDUE',
    },
  ],
  nextDue: {
    date: '2026-08-10',
    totalAmount: '450.00',
    items: [
      {
        type: 'DEBT',
        id: 'debt-1',
        planId: null,
        description: 'Television',
        remainingAmount: '400.00',
      },
      {
        type: 'INSTALLMENT',
        id: 'installment-2',
        planId: 'plan-1',
        description: 'Refrigerator',
        remainingAmount: '50.00',
      },
    ],
  },
  recentPayments: [
    {
      id: 'payment-1',
      totalAmount: '150.00',
      paymentDate: '2026-08-15',
      paymentMethod: 'CASH',
      reference: 'receipt-1',
      notes: null,
      idempotencyKey: null,
      createdAt: '2026-08-15T10:00:00.000Z',
      createdBy: { id: 'admin-1', name: 'Admin User', username: 'admin' },
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
          createdAt: '2026-08-15T10:00:00.000Z',
        },
      ],
    },
    {
      id: 'payment-2',
      totalAmount: '25.00',
      paymentDate: '2026-08-16',
      paymentMethod: 'CASH',
      reference: null,
      notes: null,
      idempotencyKey: null,
      createdAt: '2026-08-16T10:00:00.000Z',
      createdBy: { id: 'admin-1', name: 'Admin User', username: 'admin' },
      voidedAt: '2026-08-17T10:00:00.000Z',
      voidReason: 'Duplicate',
      voidedBy: { id: 'admin-1', name: 'Admin User', username: 'admin' },
      allocations: [],
    },
  ],
};

describe('customer financial profile components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authHookMock.mockReturnValue({
      user: { id: 'admin-1', username: 'admin', fullName: 'Admin User', role: 'ADMIN' },
    });
  });

  it('renders summary values from the API contract without client-side recomputation', () => {
    const html = renderToStaticMarkup(<FinancialSummaryCards summary={summary.summary} />);

    expect(html).toContain('$850.00');
    expect(html).toContain('$400.00');
    expect(html).toContain('$450.00');
    expect(html).toContain('$350.00');
    expect(html).toContain('1 debts, 1 installments');
  });

  it('renders next due same-date items and the empty state', () => {
    const html = renderToStaticMarkup(<NextDueCard nextDue={summary.nextDue} />);
    const emptyHtml = renderToStaticMarkup(<NextDueCard nextDue={null} />);

    expect(html).toContain('$450.00');
    expect(html).toContain('Television');
    expect(html).toContain('Refrigerator');
    expect(emptyHtml).toContain('No outstanding payments');
  });

  it('renders overdue debt and installment items in API order', () => {
    const html = renderToStaticMarkup(<OverdueItemsList items={summary.overdueItems} />);

    expect(html.indexOf('Old phone')).toBeLessThan(html.indexOf('Refrigerator'));
    expect(html).toContain('$50.00');
    expect(html).toContain('23 days');
  });

  it('renders debt statuses, cancellation state, and empty state', () => {
    const html = renderToStaticMarkup(
      <CustomerDebtsList debts={summary.debts} onOpenDebt={() => undefined} />
    );
    const emptyHtml = renderToStaticMarkup(
      <CustomerDebtsList debts={[]} onOpenDebt={() => undefined} />
    );

    expect(html).toContain('Partially paid');
    expect(html).toContain('Cancelled');
    expect(html).toContain('Returned');
    expect(emptyHtml).toContain('No single debts');
  });

  it('renders an unknown financial status as a neutral badge instead of crashing', () => {
    const html = renderToStaticMarkup(
      <FinancialStatusBadge type="debt" status={'WRITTEN_OFF' as never} />
    );
    const missingHtml = renderToStaticMarkup(
      <FinancialStatusBadge type="installment" status={undefined} />
    );

    expect(html).toContain('Written Off');
    expect(html).toContain('bg-slate-100');
    expect(missingHtml).toContain('Unknown');
  });

  it('renders eligible debt mutation actions for admins only', () => {
    const adminHtml = renderToStaticMarkup(
      <CustomerDebtsList
        debts={summary.debts}
        onOpenDebt={() => undefined}
        canMutate
        onRecordPayment={() => undefined}
        onCancelDebt={() => undefined}
      />
    );
    const readOnlyHtml = renderToStaticMarkup(
      <CustomerDebtsList
        debts={summary.debts}
        onOpenDebt={() => undefined}
        canMutate={false}
        onRecordPayment={() => undefined}
        onCancelDebt={() => undefined}
      />
    );

    expect(adminHtml).toContain('Payment');
    expect(adminHtml).not.toContain('Cancel</button>');
    expect(readOnlyHtml).not.toContain('Payment');
    expect(readOnlyHtml).not.toContain('Cancel</button>');
  });

  it('renders plan counts, statuses, next due, and empty state', () => {
    const html = renderToStaticMarkup(
      <InstallmentPlansList plans={summary.installmentPlans} onOpenPlan={() => undefined} />
    );
    const emptyHtml = renderToStaticMarkup(
      <InstallmentPlansList plans={[]} onOpenPlan={() => undefined} />
    );

    expect(html).toContain('1/6 complete');
    expect(html).toContain('1 overdue');
    expect(html).toContain('Overdue');
    expect(html).toContain('10/08/2026');
    expect(emptyHtml).toContain('No installment plans');
  });

  it('renders eligible installment-plan mutation actions for admins only', () => {
    const adminHtml = renderToStaticMarkup(
      <InstallmentPlansList
        plans={summary.installmentPlans}
        onOpenPlan={() => undefined}
        canMutate
        onRecordPayment={() => undefined}
        onCancelPlan={() => undefined}
      />
    );
    const completedHtml = renderToStaticMarkup(
      <InstallmentPlansList
        plans={[
          {
            ...summary.installmentPlans[0],
            calculatedStatus: 'COMPLETED',
            status: 'COMPLETED',
            totalPaid: '600.00',
            remainingBalance: '0.00',
          },
        ]}
        onOpenPlan={() => undefined}
        canMutate
        onRecordPayment={() => undefined}
        onCancelPlan={() => undefined}
      />
    );

    expect(adminHtml).toContain('Payment');
    expect(adminHtml).not.toContain('Cancel</button>');
    expect(completedHtml).not.toContain('Payment');
    expect(completedHtml).not.toContain('Cancel</button>');
  });

  it('renders each payment once with multiple allocations under the same payment', () => {
    const html = renderToStaticMarkup(
      <RecentPaymentsList
        payments={summary.recentPayments}
        canMutate
        onVoidPayment={() => undefined}
      />
    );
    const readOnlyHtml = renderToStaticMarkup(
      <RecentPaymentsList payments={summary.recentPayments} />
    );

    expect(html.match(/receipt-1/g)).toHaveLength(1);
    expect(html.match(/Refrigerator/g)).toHaveLength(2);
    expect(html).toContain('Voided');
    expect(html.match(/Void payment/g)).toHaveLength(1);
    expect(html).toContain('Duplicate');
    expect(readOnlyHtml).not.toContain('Void payment');
  });

  it('renders read-only debt details and installment plan schedule details', () => {
    debtDetailHookMock.mockReturnValue({
      data: {
        ...summary.debts[0],
        customer: { id: 'customer-1', name: 'Ali Ahmad', phone: '70123456' },
        payments: [summary.recentPayments[1]],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    planDetailHookMock.mockReturnValue({
      data: {
        ...summary.installmentPlans[0],
        customer: { id: 'customer-1', name: 'Ali Ahmad', phone: '70123456' },
        schedule: [
          {
            id: 'installment-1',
            installmentNumber: 1,
            dueDate: '2026-08-01',
            amountDue: '100.00',
            totalPaid: '100.00',
            remainingAmount: '0.00',
            status: 'PAID',
            storedStatus: 'PAID',
            paidDate: '2026-08-15',
          },
          {
            id: 'installment-2',
            installmentNumber: 2,
            dueDate: '2026-09-01',
            amountDue: '100.00',
            totalPaid: '50.00',
            remainingAmount: '50.00',
            status: 'PARTIALLY_PAID',
            storedStatus: 'PARTIALLY_PAID',
            paidDate: null,
          },
        ],
        payments: [summary.recentPayments[0]],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const debtHtml = renderToStaticMarkup(<DebtDetails debtId="debt-1" />);
    const planHtml = renderToStaticMarkup(<InstallmentPlanDetails planId="plan-1" />);

    expect(debtHtml).toContain('Television');
    expect(debtHtml).toContain('Remaining balance');
    expect(debtHtml).toContain('$400.00');
    expect(planHtml).toContain('Schedule');
    expect(planHtml).toContain('Amount due');
    expect(planHtml).toContain('Partially paid');
  });

  it('hides debt delete action for admins when the debt has payments', () => {
    debtDetailHookMock.mockReturnValue({
      data: {
        ...summary.debts[0],
        customer: { id: 'customer-1', name: 'Ali Ahmad', phone: '70123456' },
        payments: [summary.recentPayments[1]],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <DebtDetails
        debtId="debt-1"
        canMutate
        onEditDebt={() => undefined}
        onRecordPayment={() => undefined}
        onCancelDebt={() => undefined}
      />
    );

    expect(html).toContain('Edit');
    expect(html).toContain('Record payment');
    expect(html).toContain('Void or reverse payments before deleting this debt.');
    expect(html).not.toContain('Delete debt');
  });

  it('renders installment plan details with missing statuses instead of crashing', () => {
    planDetailHookMock.mockReturnValue({
      data: {
        ...summary.installmentPlans[0],
        calculatedStatus: undefined,
        customer: { id: 'customer-1', name: 'Ali Ahmad', phone: '70123456' },
        schedule: [
          {
            id: 'installment-1',
            installmentNumber: 1,
            dueDate: '2026-08-01',
            amountDue: '100.00',
            totalPaid: '0.00',
            remainingAmount: '100.00',
            status: undefined,
            storedStatus: undefined,
            paidDate: null,
          },
        ],
        payments: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const html = renderToStaticMarkup(<InstallmentPlanDetails planId="plan-1" />);

    expect(html).toContain('Refrigerator');
    expect(html.match(/Unknown/g)).toHaveLength(2);
  });

  it('renders installment plan detail edit/delete actions for admins', () => {
    planDetailHookMock.mockReturnValue({
      data: {
        ...summary.installmentPlans[0],
        totalPaid: '0.00',
        remainingBalance: '600.00',
        calculatedStatus: 'ACTIVE',
        status: 'ACTIVE',
        customer: { id: 'customer-1', name: 'Ali Ahmad', phone: '70123456' },
        schedule: [],
        payments: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <InstallmentPlanDetails
        planId="plan-1"
        canMutate
        onEditPlan={() => undefined}
        onRecordPayment={() => undefined}
        onCancelPlan={() => undefined}
      />
    );

    expect(html).toContain('Edit');
    expect(html).toContain('Delete plan');
    expect(html).toContain('Record payment');
  });

  it('shows delete as available for installment plans with payments after password confirmation', () => {
    planDetailHookMock.mockReturnValue({
      data: {
        ...summary.installmentPlans[0],
        totalPaid: '150.00',
        calculatedStatus: 'ACTIVE',
        status: 'ACTIVE',
        customer: { id: 'customer-1', name: 'Ali Ahmad', phone: '70123456' },
        schedule: [],
        payments: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <InstallmentPlanDetails
        planId="plan-1"
        canMutate
        onEditPlan={() => undefined}
        onCancelPlan={() => undefined}
      />
    );

    expect(html).toContain('Delete plan');
    expect(html).toContain('Edit');
    expect(html).not.toContain('disabled=""');
  });

  it('renders loading, success, and error states at the profile level', () => {
    summaryHookMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    expect(
      renderToStaticMarkup(
        <CustomerFinancialProfile customerId="customer-1" legacyLedger={<div>Legacy</div>} />
      )
    ).toContain('Loading customer financial profile');

    summaryHookMock.mockReturnValue({
      data: summary,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    const successHtml = renderToStaticMarkup(
      <CustomerFinancialProfile customerId="customer-1" legacyLedger={<div>Legacy</div>} />
    );
    expect(successHtml).toContain('Financial Profile');
    expect(successHtml).toContain('Show cancelled records');
    expect(successHtml).toContain('Add financial obligation');

    authHookMock.mockReturnValue({
      user: { id: 'employee-1', username: 'employee', fullName: 'Employee User', role: 'EMPLOYEE' },
    });
    const employeeHtml = renderToStaticMarkup(
      <CustomerFinancialProfile customerId="customer-1" legacyLedger={<div>Legacy</div>} />
    );
    expect(employeeHtml).not.toContain('Add financial obligation');

    summaryHookMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { response: { status: 404 } },
      refetch: vi.fn(),
    });
    expect(
      renderToStaticMarkup(
        <CustomerFinancialProfile customerId="customer-1" legacyLedger={<div>Legacy</div>} />
      )
    ).toContain('Customer not found');
  });

  it('renders add-obligation selector with display-only customer context', () => {
    const html = renderToStaticMarkup(
      <AddFinancialObligationDialog customer={summary.customer} onSuccess={() => undefined} />
    );

    expect(html).toContain('Ali Ahmad');
    expect(html).toContain('70123456');
    expect(html).toContain('Single debt');
    expect(html).toContain('Installment plan');
    expect(html).not.toContain('customerName');
  });
});
