import { Decimal } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MonthlyDebtsService } from './monthly-debts.service';

const { repositoryMock } = vi.hoisted(() => ({
  repositoryMock: {
    loadSnapshotRecords: vi.fn(),
    loadActivityRecords: vi.fn(),
  },
}));

vi.mock('./monthly-debts.repository', async () => {
  const actual = await vi.importActual<typeof import('./monthly-debts.repository')>(
    './monthly-debts.repository'
  );
  return {
    ...actual,
    MonthlyDebtsRepository: repositoryMock,
  };
});

const customerA = { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', name: 'Ali Ahmad', phone: '70123456' };
const customerB = { id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', name: 'Nour, Trading', phone: '03654321' };

describe('MonthlyDebtsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMock.loadSnapshotRecords.mockResolvedValue({
      debts: [],
      plans: [],
      paymentsThroughCutoff: [],
      monthlyPayments: [],
    });
    repositoryMock.loadActivityRecords.mockResolvedValue({
      debts: [],
      plans: [],
      payments: [],
    });
  });

  it('returns zero totals when no data exists for the month', async () => {
    const report = await MonthlyDebtsService.getMonthlyDebtReport({
      month: '2026-07',
      mode: 'SNAPSHOT',
      includeZero: false,
      includeCancelled: false,
      overdueOnly: false,
      page: 1,
      limit: 50,
      sortBy: 'OUTSTANDING',
      sortOrder: 'DESC',
    });

    expect(report.summary).toMatchObject({
      month: '2026-07',
      cutoffDate: '2026-07-31',
      customerCount: 0,
      totalOutstanding: '0.00',
    });
    expect(report.rows).toEqual([]);
  });

  it('calculates debt outstanding at cutoff and ignores later payments', async () => {
    repositoryMock.loadSnapshotRecords.mockResolvedValue({
      debts: [
        debt({
          customer: customerA,
          originalAmount: '500.00',
          dueDate: '2026-07-15',
          allocations: [
            allocation('200.00', '2026-07-20'),
            allocation('300.00', '2026-08-05'),
          ],
        }),
      ],
      plans: [],
      paymentsThroughCutoff: [payment(customerA, '200.00', '2026-07-20')],
      monthlyPayments: [payment(customerA, '200.00', '2026-07-20')],
    });

    const report = await MonthlyDebtsService.getMonthlyDebtReport(baseSnapshotQuery());

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      singleDebtOutstanding: '300.00',
      totalOutstanding: '300.00',
      amountDueByCutoff: '300.00',
      overdueAmountAtCutoff: '300.00',
      lastPaymentDate: '2026-07-20',
    });
    expect(report.summary.totalPaymentsReceivedDuringMonth).toBe('200.00');
  });

  it('counts future installments in contract outstanding but not due-by-cutoff', async () => {
    repositoryMock.loadSnapshotRecords.mockResolvedValue({
      debts: [],
      plans: [
        plan({
          customer: customerA,
          totalAmount: '600.00',
          installments: [
            installment('100.00', '2026-07-15', [allocation('100.00', '2026-07-20')]),
            installment('100.00', '2026-08-15'),
            installment('400.00', '2026-09-15'),
          ],
        }),
      ],
      paymentsThroughCutoff: [payment(customerA, '100.00', '2026-07-20')],
      monthlyPayments: [payment(customerA, '100.00', '2026-07-20')],
    });

    const report = await MonthlyDebtsService.getMonthlyDebtReport(baseSnapshotQuery());

    expect(report.rows[0]).toMatchObject({
      installmentPlanOutstanding: '500.00',
      totalOutstanding: '500.00',
      amountDueByCutoff: '0.00',
      overdueAmountAtCutoff: '0.00',
      activePlanCount: 1,
      nextDueDateAfterCutoff: '2026-08-15',
    });
  });

  it('uses historical cancellation timing at cutoff', async () => {
    repositoryMock.loadSnapshotRecords.mockResolvedValue({
      debts: [
        debt({
          customer: customerA,
          originalAmount: '100.00',
          dueDate: '2026-07-10',
          cancelledAt: new Date('2026-07-25T10:00:00.000Z'),
        }),
        debt({
          customer: customerB,
          originalAmount: '250.00',
          dueDate: '2026-07-10',
          cancelledAt: new Date('2026-08-05T10:00:00.000Z'),
        }),
      ],
      plans: [],
      paymentsThroughCutoff: [],
      monthlyPayments: [],
    });

    const report = await MonthlyDebtsService.getMonthlyDebtReport(baseSnapshotQuery());

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].customer.id).toBe(customerB.id);
    expect(report.rows[0].totalOutstanding).toBe('250.00');
  });

  it('keeps summary totals global when rows are paginated', async () => {
    repositoryMock.loadSnapshotRecords.mockResolvedValue({
      debts: [
        debt({ customer: customerA, originalAmount: '100.00', dueDate: '2026-08-10' }),
        debt({ customer: customerB, originalAmount: '200.00', dueDate: '2026-08-10' }),
      ],
      plans: [],
      paymentsThroughCutoff: [],
      monthlyPayments: [],
    });

    const report = await MonthlyDebtsService.getMonthlyDebtReport({
      ...baseSnapshotQuery(),
      page: 1,
      limit: 1,
    });

    expect(report.rows).toHaveLength(1);
    expect(report.pagination.total).toBe(2);
    expect(report.summary.customerCount).toBe(2);
    expect(report.summary.totalOutstanding).toBe('300.00');
  });

  it('excludes payments voided by cutoff and keeps payments voided after cutoff', async () => {
    repositoryMock.loadSnapshotRecords.mockResolvedValue({
      debts: [
        debt({
          customer: customerA,
          originalAmount: '500.00',
          dueDate: '2026-08-10',
          allocations: [
            allocation('100.00', '2026-07-05', new Date('2026-07-20T08:00:00.000Z')),
            allocation('150.00', '2026-07-10', new Date('2026-08-02T08:00:00.000Z')),
          ],
        }),
      ],
      plans: [],
      paymentsThroughCutoff: [],
      monthlyPayments: [],
    });

    const report = await MonthlyDebtsService.getMonthlyDebtReport(baseSnapshotQuery());

    expect(report.rows[0].totalOutstanding).toBe('350.00');
  });

  it('builds monthly activity as activity, not outstanding balance', async () => {
    repositoryMock.loadActivityRecords.mockResolvedValue({
      debts: [
        {
          id: 'debt-1',
          customer: customerA,
          description: 'Phone sale',
          originalAmount: new Decimal('500.00'),
          createdAt: date('2026-07-02'),
        },
      ],
      plans: [
        {
          id: 'plan-1',
          customer: customerA,
          description: 'Laptop plan',
          totalAmount: new Decimal('600.00'),
          createdAt: date('2026-07-03'),
        },
      ],
      payments: [
        payment(customerA, '200.00', '2026-07-15'),
        payment(customerA, '100.00', '2026-07-16', new Date('2026-07-20T08:00:00.000Z')),
      ],
    });

    const activity = await MonthlyDebtsService.getMonthlyFinancialActivity({
      month: '2026-07',
      page: 1,
      limit: 50,
    });

    expect(activity.summary).toMatchObject({
      newSingleDebtAmount: '500.00',
      newInstallmentPlanAmount: '600.00',
      paymentsReceived: '200.00',
      netFinancialChange: '900.00',
      customerCountAffected: 1,
    });
    expect(activity.items.map((item) => item.type)).toEqual([
      'DEBT_CREATED',
      'INSTALLMENT_PLAN_CREATED',
      'PAYMENT_RECEIVED',
    ]);
  });

  it('exports CSV with escaping and a stable filename', async () => {
    repositoryMock.loadSnapshotRecords.mockResolvedValue({
      debts: [
        debt({
          customer: customerB,
          originalAmount: '100.00',
          dueDate: '2026-08-10',
        }),
      ],
      plans: [],
      paymentsThroughCutoff: [],
      monthlyPayments: [],
    });

    const exportResult = await MonthlyDebtsService.getMonthlyDebtCsv(baseSnapshotQuery());

    expect(exportResult.filename).toBe('monthly-debts-2026-07.csv');
    expect(exportResult.csv).toContain('Customer Name,Phone,Single Debt Outstanding');
    expect(exportResult.csv).toContain('"Nour, Trading",03654321,100.00');
    expect(exportResult.csv.charCodeAt(0)).toBe(0xfeff);
  });
});

function baseSnapshotQuery() {
  return {
    month: '2026-07',
    mode: 'SNAPSHOT' as const,
    includeZero: false,
    includeCancelled: false,
    overdueOnly: false,
    page: 1,
    limit: 50,
    sortBy: 'OUTSTANDING' as const,
    sortOrder: 'DESC' as const,
  };
}

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function payment(
  customer: typeof customerA,
  totalAmount: string,
  paymentDate: string,
  voidedAt: Date | null = null
) {
  return {
    id: `${customer.id}-${paymentDate}-${totalAmount}`,
    customer,
    totalAmount: new Decimal(totalAmount),
    paymentDate: date(paymentDate),
    voidedAt,
    reference: null,
  };
}

function allocation(amount: string, paymentDate: string, voidedAt: Date | null = null) {
  return {
    amount: new Decimal(amount),
    payment: {
      id: `payment-${paymentDate}-${amount}`,
      totalAmount: new Decimal(amount),
      paymentDate: date(paymentDate),
      voidedAt,
    },
  };
}

function debt(params: {
  customer: typeof customerA;
  originalAmount: string;
  dueDate: string;
  allocations?: ReturnType<typeof allocation>[];
  cancelledAt?: Date | null;
}) {
  return {
    id: `debt-${params.customer.id}-${params.originalAmount}`,
    customerId: params.customer.id,
    customer: params.customer,
    description: 'Debt',
    originalAmount: new Decimal(params.originalAmount),
    dueDate: date(params.dueDate),
    status: 'UNPAID',
    notes: null,
    createdById: 'user-id',
    createdAt: date('2026-07-01'),
    updatedAt: date('2026-07-01'),
    cancelledAt: params.cancelledAt ?? null,
    cancelledById: null,
    cancelReason: null,
    paymentAllocations: params.allocations ?? [],
  };
}

function installment(
  amountDue: string,
  dueDate: string,
  allocations: ReturnType<typeof allocation>[] = []
) {
  return {
    id: `installment-${dueDate}`,
    installmentPlanId: 'plan-id',
    installmentNumber: 1,
    dueDate: date(dueDate),
    amountDue: new Decimal(amountDue),
    status: 'PENDING',
    paidDate: null,
    createdAt: date('2026-07-01'),
    updatedAt: date('2026-07-01'),
    paymentAllocations: allocations,
  };
}

function plan(params: {
  customer: typeof customerA;
  totalAmount: string;
  installments: ReturnType<typeof installment>[];
  cancelledAt?: Date | null;
}) {
  return {
    id: `plan-${params.customer.id}-${params.totalAmount}`,
    customerId: params.customer.id,
    customer: params.customer,
    description: 'Plan',
    totalAmount: new Decimal(params.totalAmount),
    startDate: date('2026-07-01'),
    installmentCount: params.installments.length,
    frequency: 'MONTHLY',
    status: 'ACTIVE',
    notes: null,
    createdById: 'user-id',
    createdAt: date('2026-07-01'),
    updatedAt: date('2026-07-01'),
    cancelledAt: params.cancelledAt ?? null,
    cancelledById: null,
    cancelReason: null,
    installments: params.installments,
  };
}
