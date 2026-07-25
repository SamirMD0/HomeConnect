import {
  DebtStatus,
  InstallmentPlanFrequency,
  InstallmentPlanStatus,
  InstallmentStatus,
  PaymentMethod,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../../lib/errors';
import {
  FinancialSummaryDebt,
  FinancialSummaryPayment,
  FinancialSummaryPlan,
} from './customer-financial-summary.repository';
import { CustomerFinancialSummaryService } from './customer-financial-summary.service';

const { repositoryMock } = vi.hoisted(() => ({
  repositoryMock: {
    loadCustomerFinancialSummary: vi.fn(),
  },
}));

vi.mock('./customer-financial-summary.repository', () => ({
  CustomerFinancialSummaryRepository: repositoryMock,
}));

vi.mock('../index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../index')>();
  return {
    ...actual,
    todayInBusinessTimezone: vi.fn(() => '2026-07-24'),
  };
});

const customerId = '22222222-2222-4222-8222-222222222222';
const adminUser = {
  id: '11111111-1111-4111-8111-111111111111',
  fullName: 'Admin User',
  username: 'admin',
};
const customer = {
  id: customerId,
  name: 'Ali Ahmad',
  phone: '70123456',
  address: null,
  notes: null,
  isActive: true,
  deletedAt: null,
};

function businessDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function makeDebt(overrides: Record<string, unknown> = {}): FinancialSummaryDebt {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    customerId,
    description: 'Television',
    originalAmount: new Decimal('600.00'),
    dueDate: businessDate('2026-08-10'),
    status: DebtStatus.UNPAID,
    notes: null,
    createdById: adminUser.id,
    createdBy: adminUser,
    createdAt: new Date('2026-07-24T09:00:00.000Z'),
    updatedAt: new Date('2026-07-24T09:00:00.000Z'),
    cancelledAt: null,
    cancelledById: null,
    cancelledBy: null,
    cancelReason: null,
    paymentAllocations: [],
    ...overrides,
  } as unknown as FinancialSummaryDebt;
}

function makeDebtAllocation(
  debtId: string,
  amount: string,
  paymentOverrides: Record<string, unknown> = {}
): FinancialSummaryDebt['paymentAllocations'][number] {
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
  } as unknown as FinancialSummaryDebt['paymentAllocations'][number];
}

function makeInstallment(
  installmentNumber: number,
  dueDate: string,
  amountDue = '100.00',
  overrides: Record<string, unknown> = {}
): FinancialSummaryPlan['installments'][number] {
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
  } as unknown as FinancialSummaryPlan['installments'][number];
}

function makeInstallmentAllocation(
  installmentId: string,
  amount: string,
  paymentOverrides: Record<string, unknown> = {}
): FinancialSummaryPlan['installments'][number]['paymentAllocations'][number] {
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
  } as unknown as FinancialSummaryPlan['installments'][number]['paymentAllocations'][number];
}

function makePlan(overrides: Record<string, unknown> = {}): FinancialSummaryPlan {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    customerId,
    description: 'Refrigerator',
    totalAmount: new Decimal('300.00'),
    startDate: businessDate('2026-08-10'),
    installmentCount: 3,
    frequency: InstallmentPlanFrequency.MONTHLY,
    status: InstallmentPlanStatus.ACTIVE,
    notes: null,
    createdById: adminUser.id,
    createdBy: adminUser,
    createdAt: new Date('2026-07-24T09:00:00.000Z'),
    updatedAt: new Date('2026-07-24T09:00:00.000Z'),
    cancelledAt: null,
    cancelledById: null,
    cancelledBy: null,
    cancelReason: null,
    installments: [
      makeInstallment(1, '2026-08-10'),
      makeInstallment(2, '2026-09-10'),
      makeInstallment(3, '2026-10-10'),
    ],
    ...overrides,
  } as unknown as FinancialSummaryPlan;
}

function makePayment(overrides: Record<string, unknown> = {}): FinancialSummaryPayment {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    customerId,
    totalAmount: new Decimal('150.00'),
    paymentDate: businessDate('2026-08-15'),
    paymentMethod: PaymentMethod.CASH,
    reference: 'receipt-1',
    notes: null,
    idempotencyKey: null,
    createdById: adminUser.id,
    createdBy: adminUser,
    createdAt: new Date('2026-08-15T10:00:00.000Z'),
    voidedAt: null,
    voidedById: null,
    voidedBy: null,
    voidReason: null,
    allocations: [],
    ...overrides,
  } as unknown as FinancialSummaryPayment;
}

function mockRecordSet(overrides: Record<string, unknown> = {}) {
  repositoryMock.loadCustomerFinancialSummary.mockResolvedValue({
    customer,
    debts: [],
    plans: [],
    totalPaid: new Decimal('0.00'),
    recentPayments: [],
    ...overrides,
  });
}

describe('CustomerFinancialSummaryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when the customer does not exist', async () => {
    mockRecordSet({ customer: null });

    await expect(
      CustomerFinancialSummaryService.getCustomerFinancialSummary(customerId, {
        includeCancelled: false,
        includePayments: true,
        paymentLimit: 20,
        debtLimit: 50,
        planLimit: 50,
      })
    ).rejects.toThrow(NotFoundError);
  });

  it('allows inactive customers with historical records and returns zero summary without financial data', async () => {
    mockRecordSet({
      customer: {
        ...customer,
        isActive: false,
      },
    });

    const result = await CustomerFinancialSummaryService.getCustomerFinancialSummary(customerId, {
      includeCancelled: false,
      includePayments: false,
      paymentLimit: 20,
      debtLimit: 50,
      planLimit: 50,
    });

    expect(result.customer.isActive).toBe(false);
    expect(result.summary.totalOutstanding).toBe('0.00');
    expect(result.summary.totalPaid).toBe('0.00');
    expect(result.summary.activeDebtCount).toBe(0);
    expect(result.summary.activePlanCount).toBe(0);
    expect(result.nextDue).toBeNull();
    expect(result.recentPayments).toEqual([]);
  });

  it('aggregates debts, plans, overdue items, next due, and unique payments without double-counting allocations', async () => {
    const partialDebt = makeDebt({
      id: '33333333-3333-4333-8333-333333333331',
      originalAmount: new Decimal('600.00'),
      paymentAllocations: [
        makeDebtAllocation('33333333-3333-4333-8333-333333333331', '200.00'),
      ],
    });
    const paidDebt = makeDebt({
      id: '33333333-3333-4333-8333-333333333332',
      originalAmount: new Decimal('100.00'),
      paymentAllocations: [
        makeDebtAllocation('33333333-3333-4333-8333-333333333332', '100.00'),
      ],
    });
    const overdueDebt = makeDebt({
      id: '33333333-3333-4333-8333-333333333333',
      description: 'Old phone',
      originalAmount: new Decimal('50.00'),
      dueDate: businessDate('2026-07-01'),
    });
    const firstInstallment = makeInstallment(1, '2026-07-10', '100.00', {
      paymentAllocations: [
        makeInstallmentAllocation('66666666-6666-4666-8666-666666666661', '50.00'),
      ],
    });
    const secondInstallment = makeInstallment(2, '2026-08-10', '100.00');
    const thirdInstallment = makeInstallment(3, '2026-09-10', '100.00');
    const partialPlan = makePlan({
      totalAmount: new Decimal('300.00'),
      installments: [firstInstallment, secondInstallment, thirdInstallment],
    });
    const multiAllocationPayment = makePayment({
      id: '77777777-7777-4777-8777-777777777777',
      totalAmount: new Decimal('150.00'),
      allocations: [
        {
          id: 'alloc-1',
          debtId: null,
          installmentId: firstInstallment.id,
          amount: new Decimal('100.00'),
          createdAt: new Date('2026-08-15T10:00:00.000Z'),
          installment: {
            id: firstInstallment.id,
            installmentNumber: 1,
            installmentPlanId: partialPlan.id,
            installmentPlan: {
              id: partialPlan.id,
              description: partialPlan.description,
            },
          },
          debt: null,
        },
        {
          id: 'alloc-2',
          debtId: null,
          installmentId: secondInstallment.id,
          amount: new Decimal('50.00'),
          createdAt: new Date('2026-08-15T10:00:00.000Z'),
          installment: {
            id: secondInstallment.id,
            installmentNumber: 2,
            installmentPlanId: partialPlan.id,
            installmentPlan: {
              id: partialPlan.id,
              description: partialPlan.description,
            },
          },
          debt: null,
        },
      ],
    });
    const voidedPayment = makePayment({
      id: '88888888-8888-4888-8888-888888888888',
      totalAmount: new Decimal('25.00'),
      paymentDate: businessDate('2026-08-16'),
      createdAt: new Date('2026-08-16T10:00:00.000Z'),
      voidedAt: new Date('2026-08-17T10:00:00.000Z'),
      voidReason: 'Duplicate',
      voidedBy: adminUser,
    });

    mockRecordSet({
      debts: [partialDebt, paidDebt, overdueDebt],
      plans: [partialPlan],
      totalPaid: new Decimal('350.00'),
      recentPayments: [voidedPayment, multiAllocationPayment],
    });

    const result = await CustomerFinancialSummaryService.getCustomerFinancialSummary(customerId, {
      includeCancelled: false,
      includePayments: true,
      paymentLimit: 20,
      debtLimit: 50,
      planLimit: 50,
    });

    expect(result.summary.singleDebtOutstanding).toBe('450.00');
    expect(result.summary.installmentPlanOutstanding).toBe('250.00');
    expect(result.summary.totalOutstanding).toBe('700.00');
    expect(result.summary.totalPaid).toBe('350.00');
    expect(result.summary.activeDebtCount).toBe(2);
    expect(result.summary.activePlanCount).toBe(1);
    expect(result.summary.overdueDebtCount).toBe(1);
    expect(result.summary.overdueInstallmentCount).toBe(1);
    expect(result.overdueItems.map((item) => item.type)).toEqual(['DEBT', 'INSTALLMENT']);
    expect(result.overdueItems[0].dueDate).toBe('2026-07-01');
    expect(result.nextDue?.date).toBe('2026-07-01');
    expect(result.nextDue?.totalAmount).toBe('50.00');
    expect(result.recentPayments).toHaveLength(2);
    expect(result.recentPayments[0].voidedAt).not.toBeNull();
    expect(result.recentPayments[1].allocations).toHaveLength(2);
  });

  it('combines debt and installment amounts when they share the earliest due date', async () => {
    const debt = makeDebt({
      id: '33333333-3333-4333-8333-333333333331',
      originalAmount: new Decimal('50.00'),
      dueDate: businessDate('2026-08-10'),
    });
    const plan = makePlan({
      totalAmount: new Decimal('100.00'),
      installmentCount: 1,
      installments: [makeInstallment(1, '2026-08-10', '100.00')],
    });
    mockRecordSet({ debts: [debt], plans: [plan] });

    const result = await CustomerFinancialSummaryService.getCustomerFinancialSummary(customerId, {
      includeCancelled: false,
      includePayments: true,
      paymentLimit: 20,
      debtLimit: 50,
      planLimit: 50,
    });

    expect(result.nextDue).toEqual({
      date: '2026-08-10',
      totalAmount: '150.00',
      items: expect.arrayContaining([
        expect.objectContaining({ type: 'DEBT', remainingAmount: '50.00' }),
        expect.objectContaining({ type: 'INSTALLMENT', remainingAmount: '100.00' }),
      ]),
    });
  });

  it('excludes cancelled obligations from totals while allowing them in lists when requested', async () => {
    const cancelledDebt = makeDebt({
      status: DebtStatus.CANCELLED,
      cancelledAt: new Date('2026-07-24T11:00:00.000Z'),
      cancelledBy: adminUser,
      cancelReason: 'Returned',
    });
    const cancelledPlan = makePlan({
      status: InstallmentPlanStatus.CANCELLED,
      cancelledAt: new Date('2026-07-24T11:00:00.000Z'),
      cancelledBy: adminUser,
      cancelReason: 'Agreement cancelled',
    });
    mockRecordSet({ debts: [cancelledDebt], plans: [cancelledPlan] });

    const result = await CustomerFinancialSummaryService.getCustomerFinancialSummary(customerId, {
      includeCancelled: true,
      includePayments: true,
      paymentLimit: 20,
      debtLimit: 50,
      planLimit: 50,
    });

    expect(repositoryMock.loadCustomerFinancialSummary).toHaveBeenCalledWith(
      expect.objectContaining({ includeCancelled: true })
    );
    expect(result.summary.totalOutstanding).toBe('0.00');
    expect(result.debts[0].calculatedStatus).toBe(DebtStatus.CANCELLED);
    expect(result.installmentPlans[0].calculatedStatus).toBe(InstallmentPlanStatus.CANCELLED);
    expect(result.overdueItems).toEqual([]);
    expect(result.nextDue).toBeNull();
  });

  it('enforces returned debt and plan limits without changing aggregate totals', async () => {
    mockRecordSet({
      debts: [
        makeDebt({ id: '33333333-3333-4333-8333-333333333331' }),
        makeDebt({ id: '33333333-3333-4333-8333-333333333332' }),
      ],
      plans: [
        makePlan({ id: '55555555-5555-4555-8555-555555555551' }),
        makePlan({ id: '55555555-5555-4555-8555-555555555552' }),
      ],
    });

    const result = await CustomerFinancialSummaryService.getCustomerFinancialSummary(customerId, {
      includeCancelled: false,
      includePayments: true,
      paymentLimit: 20,
      debtLimit: 1,
      planLimit: 1,
    });

    expect(result.debts).toHaveLength(1);
    expect(result.installmentPlans).toHaveLength(1);
    expect(result.summary.singleDebtOutstanding).toBe('1200.00');
    expect(result.summary.installmentPlanOutstanding).toBe('600.00');
  });
});
