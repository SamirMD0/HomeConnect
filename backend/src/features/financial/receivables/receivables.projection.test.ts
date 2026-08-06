import { DebtStatus, InstallmentPlanFrequency, InstallmentPlanStatus, InstallmentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ReceivableCustomerRecord,
  ReceivableDebtRecord,
  ReceivablePaymentRecord,
  ReceivablePlanRecord,
} from './receivables.repository';
import { ReceivablesService } from './receivables.service';
import { ReceivablesQueryInput } from './receivables.validator';

const { repositoryMock } = vi.hoisted(() => ({
  repositoryMock: {
    loadReceivableRecords: vi.fn(),
  },
}));

vi.mock('./receivables.repository', () => ({
  ReceivablesRepository: repositoryMock,
}));

vi.mock('../../financial', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../financial')>();
  return {
    ...actual,
    todayInBusinessTimezone: vi.fn((timezone?: string, now = new Date('2026-07-28T09:00:00.000Z')) =>
      actual.todayInBusinessTimezone(timezone, now)
    ),
  };
});

const adminUserId = '11111111-1111-4111-8111-111111111111';
const alice = makeCustomer('22222222-2222-4222-8222-222222222222', 'Alice Karam', '70111111');
const bilal = makeCustomer('33333333-3333-4333-8333-333333333333', 'Bilal Nassar', '71222222');
const carla = makeCustomer('44444444-4444-4444-8444-444444444444', 'Carla Rizk', '76333333', false);

function makeCustomer(
  id: string,
  name: string,
  phone: string,
  isActive = true
): ReceivableCustomerRecord {
  return { id, name, phone, isActive };
}

function businessDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function makePaymentAllocation(amount: string) {
  return {
    id: `allocation-${amount}`,
    paymentId: `payment-${amount}`,
    debtId: null,
    installmentId: null,
    amount: new Decimal(amount),
    createdAt: new Date('2026-07-10T10:00:00.000Z'),
    voidedAt: null,
    voidedById: null,
    correctionId: null,
    payment: { id: `payment-${amount}`, voidedAt: null },
  };
}

function makeDebt(overrides: Record<string, unknown> = {}): ReceivableDebtRecord {
  return {
    id: '55555555-5555-4555-8555-555555555551',
    customerId: alice.id,
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
  } as unknown as ReceivableDebtRecord;
}

function makeInstallment(
  installmentNumber: number,
  dueDate: string,
  amountDue: string,
  overrides: Record<string, unknown> = {}
): ReceivablePlanRecord['installments'][number] {
  return {
    id: `66666666-6666-4666-8666-66666666666${installmentNumber}`,
    installmentPlanId: '77777777-7777-4777-8777-777777777771',
    installmentNumber,
    dueDate: businessDate(dueDate),
    amountDue: new Decimal(amountDue),
    status: InstallmentStatus.PENDING,
    paidDate: null,
    createdAt: new Date('2026-07-01T08:00:00.000Z'),
    updatedAt: new Date('2026-07-01T08:00:00.000Z'),
    paymentAllocations: [],
    ...overrides,
  } as unknown as ReceivablePlanRecord['installments'][number];
}

function makePlan(overrides: Record<string, unknown> = {}): ReceivablePlanRecord {
  return {
    id: '77777777-7777-4777-8777-777777777771',
    customerId: bilal.id,
    description: 'Refrigerator',
    totalAmount: new Decimal('300.00'),
    startDate: businessDate('2026-05-01'),
    installmentCount: 3,
    frequency: InstallmentPlanFrequency.MONTHLY,
    status: InstallmentPlanStatus.ACTIVE,
    notes: null,
    createdById: adminUserId,
    createdAt: new Date('2026-05-01T08:00:00.000Z'),
    updatedAt: new Date('2026-05-01T08:00:00.000Z'),
    cancelledAt: null,
    cancelledById: null,
    cancelReason: null,
    installments: [
      makeInstallment(1, '2026-05-10', '100.00'),
      makeInstallment(2, '2026-06-10', '100.00'),
      makeInstallment(3, '2026-09-10', '100.00'),
    ],
    ...overrides,
  } as unknown as ReceivablePlanRecord;
}

function makePayment(customerId: string, paymentDate: string, totalAmount: string) {
  return {
    id: `88888888-8888-4888-8888-88888888888${paymentDate.slice(-1)}`,
    customerId,
    totalAmount: new Decimal(totalAmount),
    paymentDate: businessDate(paymentDate),
  } as unknown as ReceivablePaymentRecord;
}

function query(overrides: Partial<ReceivablesQueryInput> = {}): ReceivablesQueryInput {
  return {
    search: undefined,
    month: undefined,
    tier: [],
    onlyWithBalance: false,
    includeInactive: false,
    page: 1,
    limit: 25,
    sortBy: 'standing',
    sortOrder: 'desc',
    ...overrides,
  };
}

/** The record set both entry points are given, so their answers can be compared. */
function recordSet() {
  return {
    customers: [alice, bilal],
    debts: [makeDebt({ paymentAllocations: [makePaymentAllocation('200.00')] })],
    plans: [
      makePlan({
        installments: [
          makeInstallment(1, '2026-05-10', '100.00', {
            paymentAllocations: [makePaymentAllocation('100.00')],
          }),
          makeInstallment(2, '2026-06-10', '100.00'),
          makeInstallment(3, '2026-09-10', '100.00'),
        ],
      }),
    ],
    payments: [
      makePayment(alice.id, '2026-07-05', '200.00'),
      makePayment(bilal.id, '2026-05-09', '100.00'),
    ],
  };
}

describe('ReceivablesService.computeReceivableProjections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes the load to the requested customers instead of the whole book', async () => {
    repositoryMock.loadReceivableRecords.mockResolvedValue({
      customers: [alice],
      debts: [],
      plans: [],
      payments: [],
    });

    await ReceivablesService.computeReceivableProjections({ customerIds: [alice.id] });

    expect(repositoryMock.loadReceivableRecords).toHaveBeenCalledWith({
      includeInactive: true,
      customerIds: [alice.id],
    });
  });

  it('does not touch the database for an empty id list', async () => {
    const projections = await ReceivablesService.computeReceivableProjections({ customerIds: [] });

    expect(projections.size).toBe(0);
    expect(repositoryMock.loadReceivableRecords).not.toHaveBeenCalled();
  });

  it('includes inactive customers so a list never renders a blank money column', async () => {
    repositoryMock.loadReceivableRecords.mockResolvedValue({
      customers: [carla],
      debts: [],
      plans: [],
      payments: [],
    });

    const projections = await ReceivablesService.computeReceivableProjections({
      customerIds: [carla.id],
    });

    expect(projections.get(carla.id)).toMatchObject({
      customerId: carla.id,
      outstanding: '0.00',
      overdueAmount: '0.00',
      openDebtCount: 0,
      activePlanCount: 0,
      tier: 'NO_ACTIVITY',
      nextDueDate: null,
      lastPaymentDate: null,
      daysSinceLastPayment: null,
    });
  });

  it('reports the same figures the receivables page reports for the same records', async () => {
    repositoryMock.loadReceivableRecords.mockResolvedValue(recordSet());
    const receivables = await ReceivablesService.getReceivables(
      query({ sortBy: 'name', sortOrder: 'asc' })
    );

    repositoryMock.loadReceivableRecords.mockResolvedValue(recordSet());
    const projections = await ReceivablesService.computeReceivableProjections({
      customerIds: [alice.id, bilal.id],
    });

    // One computation, two entry points: the customers list and the receivables
    // page must never disagree about what a customer owes.
    for (const item of receivables.items) {
      const projection = projections.get(item.customer.id);
      expect(projection).toBeDefined();
      expect(projection).toMatchObject({
        tier: item.tier,
        tierReason: item.tierReason,
        totalObligated: item.totalObligated,
        totalPaid: item.totalPaid,
        outstanding: item.outstanding,
        overdueAmount: item.overdueAmount,
        openDebtCount: item.openDebtCount,
        activePlanCount: item.activePlanCount,
        overdueItemCount: item.overdueItemCount,
        maxOverdueDays: item.maxOverdueDays,
        nextDueDate: item.nextDueDate,
        lastPaymentDate: item.lastPaymentDate,
        daysSinceLastPayment: item.daysSinceLastPayment,
      });
    }
  });

  it('returns money as fixed-2 strings, never numbers', async () => {
    repositoryMock.loadReceivableRecords.mockResolvedValue(recordSet());

    const projections = await ReceivablesService.computeReceivableProjections({
      customerIds: [alice.id, bilal.id],
    });
    const projection = projections.get(alice.id)!;

    expect(projection.outstanding).toBe('300.00');
    expect(projection.totalPaid).toBe('200.00');
    expect(typeof projection.overdueAmount).toBe('string');
  });
});
