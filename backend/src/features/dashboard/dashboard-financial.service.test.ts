import {
  DebtKind,
  DebtStatus,
  InstallmentPlanFrequency,
  InstallmentPlanStatus,
  InstallmentStatus,
  PaymentMethod,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DashboardDebtRecord,
  DashboardPaymentRecord,
  DashboardPlanRecord,
} from './dashboard-financial.repository';
import { DashboardFinancialService } from './dashboard-financial.service';

const { repositoryMock, branchFindMany } = vi.hoisted(() => ({
  repositoryMock: {
    loadFinancialRecords: vi.fn(),
    loadFinancialRecordsByBranch: vi.fn(),
  },
  branchFindMany: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({ prisma: { branch: { findMany: branchFindMany } } }));

vi.mock('./dashboard-financial.repository', () => ({
  DashboardFinancialRepository: repositoryMock,
}));

vi.mock('../financial', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../financial')>();
  return {
    ...actual,
    todayInBusinessTimezone: vi.fn((timezone?: string, now = new Date('2026-07-27T09:00:00.000Z')) =>
      actual.todayInBusinessTimezone(timezone, now)
    ),
  };
});

const adminUserId = '11111111-1111-4111-8111-111111111111';
const customer = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Ali Ahmad',
  phone: '70123456',
};
const secondCustomer = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Maya Haddad',
  phone: '71123456',
};

function businessDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function makePaymentAllocation(amount: string, paymentVoidedAt: Date | null = null) {
  return {
    id: `allocation-${amount}-${paymentVoidedAt ? 'voided' : 'active'}`,
    paymentId: `payment-${amount}`,
    debtId: null,
    installmentId: null,
    amount: new Decimal(amount),
    createdAt: new Date('2026-07-27T10:00:00.000Z'),
    voidedAt: null,
    voidedById: null,
    correctionId: null,
    payment: {
      id: `payment-${amount}`,
      voidedAt: paymentVoidedAt,
    },
  };
}

function makeDebt(overrides: Record<string, unknown> = {}): DashboardDebtRecord {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    customerId: customer.id,
    customer,
    description: 'Television',
    originalAmount: new Decimal('500.00'),
    dueDate: businessDate('2026-07-20'),
    status: DebtStatus.UNPAID,
    notes: null,
    createdById: adminUserId,
    createdAt: new Date('2026-07-01T08:00:00.000Z'),
    updatedAt: new Date('2026-07-01T08:00:00.000Z'),
    cancelledAt: null,
    cancelledById: null,
    cancelReason: null,
    paymentAllocations: [],
    ...overrides,
  } as unknown as DashboardDebtRecord;
}

function makeInstallment(
  installmentNumber: number,
  dueDate: string,
  amountDue: string,
  overrides: Record<string, unknown> = {}
): DashboardPlanRecord['installments'][number] {
  return {
    id: `55555555-5555-4555-8555-55555555555${installmentNumber}`,
    installmentPlanId: '66666666-6666-4666-8666-666666666666',
    installmentNumber,
    dueDate: businessDate(dueDate),
    amountDue: new Decimal(amountDue),
    status: InstallmentStatus.PENDING,
    paidDate: null,
    createdAt: new Date('2026-07-01T08:00:00.000Z'),
    updatedAt: new Date('2026-07-01T08:00:00.000Z'),
    paymentAllocations: [],
    ...overrides,
  } as unknown as DashboardPlanRecord['installments'][number];
}

function makePlan(overrides: Record<string, unknown> = {}): DashboardPlanRecord {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    customerId: customer.id,
    customer,
    description: 'Refrigerator',
    totalAmount: new Decimal('300.00'),
    startDate: businessDate('2026-07-01'),
    installmentCount: 2,
    frequency: InstallmentPlanFrequency.MONTHLY,
    status: InstallmentPlanStatus.ACTIVE,
    notes: null,
    createdById: adminUserId,
    createdAt: new Date('2026-07-02T08:00:00.000Z'),
    updatedAt: new Date('2026-07-02T08:00:00.000Z'),
    cancelledAt: null,
    cancelledById: null,
    cancelReason: null,
    installments: [
      makeInstallment(1, '2026-07-10', '100.00'),
      makeInstallment(2, '2026-08-10', '200.00'),
    ],
    ...overrides,
  } as unknown as DashboardPlanRecord;
}

function makePayment(overrides: Record<string, unknown> = {}): DashboardPaymentRecord {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    customerId: customer.id,
    customer,
    totalAmount: new Decimal('100.00'),
    paymentDate: businessDate('2026-07-27'),
    paymentMethod: PaymentMethod.CASH,
    reference: 'receipt-1',
    notes: null,
    idempotencyKey: null,
    createdById: adminUserId,
    createdAt: new Date('2026-07-27T10:00:00.000Z'),
    voidedAt: null,
    voidedById: null,
    voidReason: null,
    allocations: [{ id: 'payment-allocation-1' }],
    ...overrides,
  } as unknown as DashboardPaymentRecord;
}

describe('DashboardFinancialService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds dashboard financial summary from active financial records with string money', async () => {
    repositoryMock.loadFinancialRecords.mockResolvedValue({
      totalCustomers: 2,
      debts: [
        makeDebt({
          paymentAllocations: [makePaymentAllocation('100.00')],
        }),
        makeDebt({
          id: '44444444-4444-4444-8444-444444444445',
          customerId: secondCustomer.id,
          customer: secondCustomer,
          description: 'Phone',
          originalAmount: new Decimal('200.00'),
          dueDate: businessDate('2026-08-01'),
          createdAt: new Date('2026-07-27T08:00:00.000Z'),
        }),
      ],
      plans: [
        makePlan({
          installments: [
            makeInstallment(1, '2026-07-10', '100.00', {
              paymentAllocations: [makePaymentAllocation('50.00')],
            }),
            makeInstallment(2, '2026-08-10', '200.00'),
          ],
        }),
      ],
      payments: [
        makePayment(),
        makePayment({
          id: '77777777-7777-4777-8777-777777777778',
          totalAmount: new Decimal('50.00'),
          paymentDate: businessDate('2026-07-10'),
          createdAt: new Date('2026-07-10T10:00:00.000Z'),
        }),
      ],
    });

    const summary = await DashboardFinancialService.getFinancialSummary(phase3cScope);

    expect(summary.businessDate).toBe('2026-07-27');
    expect(summary.monthStart).toBe('2026-07-01');
    expect(summary.counts).toEqual({
      totalCustomers: 2,
      customersWithOutstanding: 2,
    });
    expect(summary.money).toEqual({
      totalOutstanding: '850.00',
      paymentsToday: '100.00',
      paymentsThisMonth: '150.00',
      obligationsCreatedToday: '200.00',
      obligationsCreatedThisMonth: '1000.00',
      netChangeToday: '100.00',
      netChangeThisMonth: '850.00',
    });
    expect(summary.upcomingDue.map((item) => item.description)).toEqual(['Phone', 'Refrigerator']);
    expect(summary.overdueCustomers).toEqual([
      {
        customer,
        overdueItemCount: 2,
        totalOverdue: '450.00',
      },
    ]);
    expect(summary.recentPayments[0]).toMatchObject({
      amount: '100.00',
      paymentDate: '2026-07-27',
      allocationCount: 1,
    });
  });

  it('excludes prepaid purchase remainders from dashboard customer outstanding', async () => {
    repositoryMock.loadFinancialRecords.mockResolvedValue({
      totalCustomers: 1,
      debts: [
        makeDebt({
          kind: DebtKind.PREPAID_PURCHASE,
          originalAmount: new Decimal('400.00'),
          paymentAllocations: [makePaymentAllocation('100.00')],
        }),
      ],
      plans: [],
      payments: [],
    });

    const summary = await DashboardFinancialService.getFinancialSummary(phase3cScope);
    expect(summary.counts.customersWithOutstanding).toBe(0);
    expect(summary.money.totalOutstanding).toBe('0.00');
    expect(summary.money.obligationsCreatedThisMonth).toBe('0.00');
  });
});

describe('DashboardFinancialService branch breakdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads records once and serves the total and each branch from them', async () => {
    const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const scope = { mode: 'all' as const, branchIds: [branchA, branchB] };
    const debtA = makeDebt({ originalAmount: new Decimal('300.00') });
    const debtB = makeDebt({ id: '44444444-4444-4444-8444-444444444449', originalAmount: new Decimal('200.00') });
    const recordSet = (totalCustomers: number, debts: DashboardDebtRecord[]) =>
      ({ totalCustomers, debts, plans: [], payments: [], returns: [] });
    repositoryMock.loadFinancialRecordsByBranch.mockResolvedValue({
      total: recordSet(3, [debtA, debtB]),
      byBranch: new Map([[branchA, recordSet(2, [debtA])], [branchB, recordSet(1, [debtB])]]),
    });
    branchFindMany.mockResolvedValue([
      { id: branchA, code: 'A', name: 'Branch A' },
      { id: branchB, code: 'B', name: 'Branch B' },
    ]);

    const summary = await DashboardFinancialService.getFinancialSummary(scope);

    expect(repositoryMock.loadFinancialRecordsByBranch).toHaveBeenCalledExactlyOnceWith(scope);
    expect(repositoryMock.loadFinancialRecords).not.toHaveBeenCalled();
    expect(summary.money.totalOutstanding).toBe('500.00');
    expect(summary.branchBreakdown?.map((row) => [row.branchCode, row.counts.totalCustomers, row.money.totalOutstanding]))
      .toEqual([['A', 2, '300.00'], ['B', 1, '200.00']]);
  });
});

const phase3cScope = { mode: 'all' as const, branchIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] };

vi.mock('../branches/branch-breakdown', async (importOriginal) => ({
  ...await importOriginal<typeof import('../branches/branch-breakdown')>(),
  branchLabel: vi.fn().mockResolvedValue('Phase 3C A'),
}));
