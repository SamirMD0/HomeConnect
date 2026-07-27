import {
  DebtStatus,
  InstallmentPlanFrequency,
  InstallmentPlanStatus,
  InstallmentStatus,
  PaymentMethod,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FinancialLedgerDebtRecord,
  FinancialLedgerPaymentRecord,
  FinancialLedgerPlanRecord,
} from './financial-ledger.repository';
import { FinancialLedgerService } from './financial-ledger.service';

const { repositoryMock } = vi.hoisted(() => ({
  repositoryMock: {
    loadFinancialLedger: vi.fn(),
    loadCorrectionMarkers: vi.fn(),
  },
}));

vi.mock('./financial-ledger.repository', () => ({
  FinancialLedgerRepository: repositoryMock,
}));

vi.mock('../index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../index')>();
  return {
    ...actual,
    todayInBusinessTimezone: vi.fn(() => '2026-07-24'),
  };
});

const customer = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Ali Ahmad',
  phone: '70123456',
};

function businessDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function makeDebt(overrides: Record<string, unknown> = {}): FinancialLedgerDebtRecord {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    customerId: customer.id,
    customer,
    description: 'Television',
    originalAmount: new Decimal('600.00'),
    dueDate: businessDate('2026-08-10'),
    status: DebtStatus.UNPAID,
    notes: null,
    createdById: '11111111-1111-4111-8111-111111111111',
    createdAt: new Date('2026-07-24T09:00:00.000Z'),
    updatedAt: new Date('2026-07-24T09:00:00.000Z'),
    cancelledAt: null,
    cancelledById: null,
    cancelReason: null,
    paymentAllocations: [],
    ...overrides,
  } as unknown as FinancialLedgerDebtRecord;
}

function makeDebtAllocation(
  debtId: string,
  amount: string,
  paymentOverrides: Record<string, unknown> = {}
): FinancialLedgerDebtRecord['paymentAllocations'][number] {
  return {
    id: `allocation-${debtId}-${amount}`,
    paymentId: `payment-${debtId}-${amount}`,
    debtId,
    installmentId: null,
    amount: new Decimal(amount),
    createdAt: new Date('2026-07-24T10:00:00.000Z'),
    payment: {
      id: `payment-${debtId}-${amount}`,
      voidedAt: null,
      ...paymentOverrides,
    },
  } as unknown as FinancialLedgerDebtRecord['paymentAllocations'][number];
}

function makeInstallment(
  installmentNumber: number,
  dueDate: string,
  amountDue = '100.00',
  overrides: Record<string, unknown> = {}
): FinancialLedgerPlanRecord['installments'][number] {
  return {
    id: `66666666-6666-4666-8666-66666666666${installmentNumber}`,
    installmentPlanId: '55555555-5555-4555-8555-555555555555',
    installmentNumber,
    dueDate: businessDate(dueDate),
    amountDue: new Decimal(amountDue),
    status: InstallmentStatus.PENDING,
    paidDate: null,
    createdAt: new Date('2026-07-24T09:00:00.000Z'),
    updatedAt: new Date('2026-07-24T09:00:00.000Z'),
    paymentAllocations: [],
    ...overrides,
  } as unknown as FinancialLedgerPlanRecord['installments'][number];
}

function makeInstallmentAllocation(
  installmentId: string,
  amount: string,
  paymentOverrides: Record<string, unknown> = {}
): FinancialLedgerPlanRecord['installments'][number]['paymentAllocations'][number] {
  return {
    id: `allocation-${installmentId}-${amount}`,
    paymentId: `payment-${installmentId}-${amount}`,
    debtId: null,
    installmentId,
    amount: new Decimal(amount),
    createdAt: new Date('2026-07-24T10:00:00.000Z'),
    payment: {
      id: `payment-${installmentId}-${amount}`,
      voidedAt: null,
      ...paymentOverrides,
    },
  } as unknown as FinancialLedgerPlanRecord['installments'][number]['paymentAllocations'][number];
}

function makePlan(overrides: Record<string, unknown> = {}): FinancialLedgerPlanRecord {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    customerId: customer.id,
    customer,
    description: 'Refrigerator',
    totalAmount: new Decimal('300.00'),
    startDate: businessDate('2026-08-10'),
    installmentCount: 3,
    frequency: InstallmentPlanFrequency.MONTHLY,
    status: InstallmentPlanStatus.ACTIVE,
    notes: null,
    createdById: '11111111-1111-4111-8111-111111111111',
    createdAt: new Date('2026-07-24T09:00:00.000Z'),
    updatedAt: new Date('2026-07-24T09:00:00.000Z'),
    cancelledAt: null,
    cancelledById: null,
    cancelReason: null,
    installments: [
      makeInstallment(1, '2026-08-10'),
      makeInstallment(2, '2026-09-10'),
      makeInstallment(3, '2026-10-10'),
    ],
    ...overrides,
  } as unknown as FinancialLedgerPlanRecord;
}

function makePayment(overrides: Record<string, unknown> = {}): FinancialLedgerPaymentRecord {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    customerId: customer.id,
    customer,
    totalAmount: new Decimal('150.00'),
    paymentDate: businessDate('2026-08-15'),
    paymentMethod: PaymentMethod.CASH,
    reference: 'receipt-1',
    notes: null,
    idempotencyKey: null,
    createdById: '11111111-1111-4111-8111-111111111111',
    createdAt: new Date('2026-08-15T10:00:00.000Z'),
    voidedAt: null,
    voidedById: null,
    voidReason: null,
    allocations: [],
    ...overrides,
  } as unknown as FinancialLedgerPaymentRecord;
}

function mockRecordSet(overrides: Record<string, unknown> = {}) {
  repositoryMock.loadFinancialLedger.mockResolvedValue({
    debts: [],
    plans: [],
    payments: [],
    totalPaid: new Decimal('0.00'),
    ...overrides,
  });
  repositoryMock.loadCorrectionMarkers.mockResolvedValue({
    debts: new Map(),
    plans: new Map(),
    payments: new Map(),
  });
}

function baseQuery(overrides: Record<string, unknown> = {}) {
  return {
    type: 'ALL',
    includeCancelled: false,
    includeCompleted: false,
    correctedOnly: false,
    page: 1,
    limit: 25,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    ...overrides,
  } as Parameters<typeof FinancialLedgerService.getFinancialLedger>[0];
}

describe('FinancialLedgerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns zero summary and empty pagination without financial data', async () => {
    mockRecordSet();

    const result = await FinancialLedgerService.getFinancialLedger(baseQuery({ includeCompleted: true }));

    expect(result.summary.basis).toBe('filtered');
    expect(result.summary.totalOutstanding).toBe('0.00');
    expect(result.summary.totalPaid).toBe('0.00');
    expect(result.items).toEqual([]);
    expect(result.pagination.totalPages).toBe(1);
  });

  it('hides completed rows by default and places them after active rows when included', async () => {
    const activeDebt = makeDebt({
      id: '33333333-3333-4333-8333-333333333331',
      description: 'Newest active bill',
      createdAt: new Date('2026-07-24T12:00:00.000Z'),
    });
    const completedDebt = makeDebt({
      id: '33333333-3333-4333-8333-333333333332',
      description: 'Completed bill',
      originalAmount: new Decimal('100.00'),
      status: DebtStatus.PAID,
      paymentAllocations: [
        makeDebtAllocation('33333333-3333-4333-8333-333333333332', '100.00'),
      ],
      createdAt: new Date('2026-07-25T12:00:00.000Z'),
    });
    const olderActiveDebt = makeDebt({
      id: '33333333-3333-4333-8333-333333333333',
      description: 'Older active bill',
      createdAt: new Date('2026-07-23T12:00:00.000Z'),
    });
    mockRecordSet({ debts: [completedDebt, olderActiveDebt, activeDebt] });

    const defaultResult = await FinancialLedgerService.getFinancialLedger(baseQuery());
    const includedResult = await FinancialLedgerService.getFinancialLedger(
      baseQuery({ includeCompleted: true })
    );

    expect(defaultResult.items.map((item) => item.id)).toEqual([activeDebt.id, olderActiveDebt.id]);
    expect(includedResult.items.map((item) => item.id)).toEqual([
      activeDebt.id,
      olderActiveDebt.id,
      completedDebt.id,
    ]);
  });

  it('serializes debt, plan, and one multi-allocation payment item without double-counting payment rows', async () => {
    const debt = makeDebt({
      id: '33333333-3333-4333-8333-333333333331',
      paymentAllocations: [
        makeDebtAllocation('33333333-3333-4333-8333-333333333331', '200.00'),
      ],
    });
    const firstInstallment = makeInstallment(1, '2026-07-10', '100.00', {
      paymentAllocations: [
        makeInstallmentAllocation('66666666-6666-4666-8666-666666666661', '100.00'),
      ],
    });
    const secondInstallment = makeInstallment(2, '2026-08-10', '100.00', {
      paymentAllocations: [
        makeInstallmentAllocation('66666666-6666-4666-8666-666666666662', '50.00'),
      ],
    });
    const plan = makePlan({
      installments: [firstInstallment, secondInstallment, makeInstallment(3, '2026-09-10')],
    });
    const payment = makePayment({
      allocations: [
        {
          id: 'allocation-1',
          debtId: null,
          installmentId: firstInstallment.id,
          amount: new Decimal('100.00'),
          createdAt: new Date('2026-08-15T10:00:00.000Z'),
          debt: null,
          installment: {
            id: firstInstallment.id,
            installmentPlanId: plan.id,
            installmentPlan: {
              id: plan.id,
              description: plan.description,
            },
          },
        },
        {
          id: 'allocation-2',
          debtId: null,
          installmentId: secondInstallment.id,
          amount: new Decimal('50.00'),
          createdAt: new Date('2026-08-15T10:00:01.000Z'),
          debt: null,
          installment: {
            id: secondInstallment.id,
            installmentPlanId: plan.id,
            installmentPlan: {
              id: plan.id,
              description: plan.description,
            },
          },
        },
      ],
    });
    mockRecordSet({
      debts: [debt],
      plans: [plan],
      payments: [payment],
      totalPaid: new Decimal('350.00'),
    });

    const result = await FinancialLedgerService.getFinancialLedger(baseQuery({ includeCompleted: true }));

    expect(result.summary.totalOutstanding).toBe('550.00');
    expect(result.summary.totalPaid).toBe('350.00');
    expect(result.summary.activeDebtCount).toBe(1);
    expect(result.summary.activePlanCount).toBe(1);
    expect(result.summary.activeCustomerCount).toBe(1);
    expect(result.items.filter((item) => item.type === 'PAYMENT')).toHaveLength(1);
    expect(result.items.find((item) => item.type === 'PAYMENT')).toMatchObject({
      amount: '150.00',
      correction: {
        hasCorrections: false,
        correctionCount: 0,
        lastCorrectedAt: null,
      },
      allocations: expect.arrayContaining([
        expect.objectContaining({ amount: '100.00' }),
        expect.objectContaining({ amount: '50.00' }),
      ]),
    });
  });

  it('uses month-filtered installment paid amounts for total paid when due dates are filtered', async () => {
    const plan = makePlan({
      totalAmount: new Decimal('300.00'),
      installments: [
        makeInstallment(1, '2026-08-10', '100.00', {
          paymentAllocations: [
            makeInstallmentAllocation('66666666-6666-4666-8666-666666666661', '40.00'),
          ],
        }),
        makeInstallment(2, '2026-09-10', '100.00'),
        makeInstallment(3, '2026-10-10', '100.00'),
      ],
    });
    mockRecordSet({
      plans: [plan],
      payments: [],
    });

    const result = await FinancialLedgerService.getFinancialLedger(
      baseQuery({
        dueFrom: '2026-08-01',
        dueTo: '2026-08-31',
        paymentFrom: '2026-08-01',
        paymentTo: '2026-08-31',
      })
    );

    expect(result.summary.totalOutstanding).toBe('60.00');
    expect(result.summary.totalPaid).toBe('40.00');
    expect(result.summary.activeCustomerCount).toBe(1);
    expect(result.items.find((item) => item.type === 'INSTALLMENT_PLAN')).toMatchObject({
      periodSummary: {
        dueFrom: '2026-08-01',
        dueTo: '2026-08-31',
        installmentCount: 1,
        totalDue: '100.00',
        totalPaid: '40.00',
        totalRemaining: '60.00',
      },
    });
  });

  it('marks corrected rows and supports the corrected-only ledger filter', async () => {
    const debt = makeDebt({
      id: '33333333-3333-4333-8333-333333333331',
      description: 'Corrected TV',
    });
    const plan = makePlan({
      id: '55555555-5555-4555-8555-555555555551',
      description: 'Uncorrected refrigerator',
    });
    mockRecordSet({
      debts: [debt],
      plans: [plan],
    });
    repositoryMock.loadCorrectionMarkers.mockResolvedValue({
      debts: new Map([
        [
          debt.id,
          {
            hasCorrections: true,
            correctionCount: 2,
            lastCorrectedAt: new Date('2026-08-20T11:00:00.000Z'),
          },
        ],
      ]),
      plans: new Map(),
      payments: new Map(),
    });

    const result = await FinancialLedgerService.getFinancialLedger(baseQuery({ correctedOnly: true }));

    expect(repositoryMock.loadCorrectionMarkers).toHaveBeenCalledWith({
      debtIds: [debt.id],
      planIds: [plan.id],
      paymentIds: [],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      type: 'DEBT',
      description: 'Corrected TV',
      correction: {
        hasCorrections: true,
        correctionCount: 2,
        lastCorrectedAt: '2026-08-20T11:00:00.000Z',
      },
    });
  });

  it('excludes cancelled obligations by default and includes them when requested', async () => {
    const cancelledDebt = makeDebt({
      status: DebtStatus.CANCELLED,
      cancelledAt: new Date('2026-07-24T10:00:00.000Z'),
      cancelReason: 'Returned',
    });
    mockRecordSet({ debts: [cancelledDebt] });

    const defaultResult = await FinancialLedgerService.getFinancialLedger(baseQuery());
    const includedResult = await FinancialLedgerService.getFinancialLedger(
      baseQuery({ includeCancelled: true, status: 'CANCELLED' })
    );

    expect(defaultResult.items).toEqual([]);
    expect(includedResult.items).toHaveLength(1);
    expect(includedResult.items[0]).toMatchObject({ type: 'DEBT', status: 'CANCELLED' });
  });

  it('filters overdue obligations and paginates the normalized item list', async () => {
    mockRecordSet({
      debts: [
        makeDebt({
          id: '33333333-3333-4333-8333-333333333331',
          description: 'Old phone',
          dueDate: businessDate('2026-07-01'),
        }),
        makeDebt({
          id: '33333333-3333-4333-8333-333333333332',
          description: 'Future TV',
          dueDate: businessDate('2026-08-10'),
        }),
      ],
      plans: [
        makePlan({
          id: '55555555-5555-4555-8555-555555555551',
          installments: [makeInstallment(1, '2026-07-10')],
        }),
      ],
    });

    const result = await FinancialLedgerService.getFinancialLedger(
      baseQuery({ type: 'OVERDUE', page: 2, limit: 1 })
    );

    expect(result.pagination.total).toBe(2);
    expect(result.pagination.page).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].type).toBe('DEBT');
  });

  it('passes customer search and date filters to the repository', async () => {
    mockRecordSet();

    await FinancialLedgerService.getFinancialLedger(
      baseQuery({
        search: '7012',
        dueFrom: '2026-08-01',
        paymentTo: '2026-08-31',
        type: 'PAYMENT',
      })
    );

    expect(repositoryMock.loadFinancialLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        search: '7012',
        includeDebts: false,
        includePlans: false,
        includePayments: true,
        dueFrom: new Date(Date.UTC(2026, 7, 1)),
        paymentTo: new Date(Date.UTC(2026, 7, 31)),
      })
    );
  });
});
