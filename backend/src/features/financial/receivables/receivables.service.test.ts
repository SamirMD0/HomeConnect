import {
  DebtKind,
  DebtStatus,
  InstallmentPlanFrequency,
  InstallmentPlanStatus,
  InstallmentStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  looksLikePhoneQuery,
  normalizePhoneTerm,
  normalizeSearchTerm,
  tokenizeSearchTerm,
} from '../../../lib/search-normalize';
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

// This fake approximates the SQL matcher so the service tests stay isolated
// from Prisma. Authoritative match semantics remain in search-query.customer.test.ts;
// if this fake and the SQL-shape coverage disagree, the SQL test is right.
vi.mock('../../../lib/search-query', () => ({
  findSearchMatchIds: vi.fn(async (_target: string, rawTerm: string | null | undefined) => {
    const trimmed = (rawTerm ?? '').trim();
    if (!trimmed) return null;

    const customers = [alice, bilal, carla, ahmad, mohammad];
    if (looksLikePhoneQuery(trimmed)) {
      const phoneTerm = normalizePhoneTerm(trimmed);
      return customers
        .filter((customer) => normalizePhoneTerm(customer.phone).includes(phoneTerm))
        .map((customer) => customer.id);
    }

    const tokens = tokenizeSearchTerm(trimmed);
    return customers
      .filter((customer) => {
        const normalizedName = normalizeSearchTerm(customer.name);
        return tokens.every((token) => normalizedName.includes(token));
      })
      .map((customer) => customer.id);
  }),
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
const carla = makeCustomer('44444444-4444-4444-8444-444444444444', 'Carla Rizk', '76333333');
const ahmad = makeCustomer('99999999-9999-4999-8999-999999999998', 'احمد', '70999998');
const mohammad = makeCustomer('99999999-9999-4999-8999-999999999999', 'محمد سالم عمار', '70999999');

function makeCustomer(id: string, name: string, phone: string): ReceivableCustomerRecord {
  return { id, name, phone, isActive: true };
}

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
    createdAt: new Date('2026-07-10T10:00:00.000Z'),
    voidedAt: null,
    voidedById: null,
    correctionId: null,
    payment: {
      id: `payment-${amount}`,
      voidedAt: paymentVoidedAt,
    },
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

function makePayment(
  customerId: string,
  paymentDate: string,
  totalAmount: string,
  id = `88888888-8888-4888-8888-88888888888${paymentDate.slice(-1)}`
): ReceivablePaymentRecord {
  return {
    id,
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

describe('ReceivablesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates debts, plans and payments per customer with fixed-2 money strings', async () => {
    repositoryMock.loadReceivableRecords.mockResolvedValue({
      customers: [alice, bilal, carla],
      debts: [
        makeDebt({
          paymentAllocations: [makePaymentAllocation('200.00')],
        }),
      ],
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
    });

    const result = await ReceivablesService.getReceivables(
      query({ sortBy: 'name', sortOrder: 'asc' })
    );

    expect(result.businessDate).toBe('2026-07-28');

    const [aliceRow, bilalRow, carlaRow] = result.items;

    expect(aliceRow.customer.name).toBe('Alice Karam');
    expect(aliceRow.totalObligated).toBe('500.00');
    expect(aliceRow.totalPaid).toBe('200.00');
    expect(aliceRow.outstanding).toBe('300.00');
    expect(aliceRow.overdueAmount).toBe('300.00');
    expect(aliceRow.paidRatioPercent).toBe('40');
    expect(aliceRow.billsTotal).toBe(1);
    expect(aliceRow.billsPaid).toBe(0);
    expect(aliceRow.openDebtCount).toBe(1);
    expect(aliceRow.overdueItemCount).toBe(1);
    expect(aliceRow.maxOverdueDays).toBe(8);
    expect(aliceRow.nextDueDate).toBe('2026-07-20');
    expect(aliceRow.lastPaymentDate).toBe('2026-07-05');
    expect(aliceRow.daysSinceLastPayment).toBe(23);
    expect(aliceRow.tier).toBe('WATCH');

    // One installment paid, one overdue since 2026-06-10, one still upcoming.
    expect(bilalRow.customer.name).toBe('Bilal Nassar');
    expect(bilalRow.billsTotal).toBe(3);
    expect(bilalRow.billsPaid).toBe(1);
    expect(bilalRow.activePlanCount).toBe(1);
    expect(bilalRow.outstanding).toBe('200.00');
    expect(bilalRow.overdueAmount).toBe('100.00');
    expect(bilalRow.maxOverdueDays).toBe(48);
    expect(bilalRow.nextDueDate).toBe('2026-06-10');
    expect(bilalRow.tier).toBe('LATE');

    expect(carlaRow.tier).toBe('NO_ACTIVITY');
    expect(carlaRow.totalObligated).toBe('0.00');
    expect(carlaRow.outstanding).toBe('0.00');
    expect(carlaRow.lastPaymentDate).toBeNull();
    expect(carlaRow.daysSinceLastPayment).toBeNull();
  });

  it('ignores voided payment allocations when computing balances', async () => {
    repositoryMock.loadReceivableRecords.mockResolvedValue({
      customers: [alice],
      debts: [
        makeDebt({
          paymentAllocations: [
            makePaymentAllocation('200.00'),
            makePaymentAllocation('150.00', new Date('2026-07-15T08:00:00.000Z')),
          ],
        }),
      ],
      plans: [],
      payments: [makePayment(alice.id, '2026-07-05', '200.00')],
    });

    const [row] = (await ReceivablesService.getReceivables(query())).items;

    expect(row.totalPaid).toBe('200.00');
    expect(row.outstanding).toBe('300.00');
  });

  it('excludes prepaid purchases from customer receivables', async () => {
    repositoryMock.loadReceivableRecords.mockResolvedValue({
      customers: [alice],
      debts: [
        makeDebt({
          kind: DebtKind.PREPAID_PURCHASE,
          originalAmount: new Decimal('400.00'),
          paymentAllocations: [makePaymentAllocation('100.00')],
        }),
      ],
      plans: [],
      payments: [makePayment(alice.id, '2026-07-05', '100.00')],
    });

    const result = await ReceivablesService.getReceivables(query());
    expect(result.items[0]).toMatchObject({
      totalObligated: '0.00',
      totalPaid: '0.00',
      outstanding: '0.00',
      openDebtCount: 0,
      tier: 'NO_ACTIVITY',
    });
    expect(result.summary.totalOutstanding).toBe('0.00');
  });

  it('excludes cancelled installments from the bill count', async () => {
    repositoryMock.loadReceivableRecords.mockResolvedValue({
      customers: [bilal],
      debts: [],
      plans: [
        makePlan({
          installments: [
            makeInstallment(1, '2026-05-10', '100.00', {
              paymentAllocations: [makePaymentAllocation('100.00')],
            }),
            makeInstallment(2, '2026-06-10', '100.00', {
              status: InstallmentStatus.CANCELLED,
            }),
            makeInstallment(3, '2026-09-10', '100.00'),
          ],
        }),
      ],
      payments: [makePayment(bilal.id, '2026-05-09', '100.00')],
    });

    const [row] = (await ReceivablesService.getReceivables(query())).items;

    expect(row.billsTotal).toBe(2);
    expect(row.billsPaid).toBe(1);
    expect(row.overdueItemCount).toBe(0);
    expect(row.tier).toBe('CURRENT');
  });

  it('keeps a customer who is one day overdue in WATCH even when they never paid', async () => {
    repositoryMock.loadReceivableRecords.mockResolvedValue({
      customers: [alice],
      debts: [makeDebt({ dueDate: businessDate('2026-07-27') })],
      plans: [],
      payments: [],
    });

    const [row] = (await ReceivablesService.getReceivables(query())).items;

    expect(row.tier).toBe('WATCH');
    expect(row.paymentCount).toBe(0);
    expect(row.tierReason).toBe('1 day late · never paid anything');
  });

  it('sorts worst standing first and keeps summary totals over the filtered set', async () => {
    repositoryMock.loadReceivableRecords.mockResolvedValue({
      customers: [alice, bilal, carla],
      debts: [
        makeDebt({ paymentAllocations: [makePaymentAllocation('200.00')] }),
        makeDebt({
          id: '55555555-5555-4555-8555-555555555552',
          customerId: carla.id,
          description: 'Washing machine',
          originalAmount: new Decimal('400.00'),
          dueDate: businessDate('2026-01-05'),
        }),
      ],
      plans: [makePlan()],
      payments: [
        makePayment(alice.id, '2026-07-05', '200.00'),
        makePayment(carla.id, '2026-01-01', '0.01', '99999999-9999-4999-8999-999999999999'),
      ],
    });

    const result = await ReceivablesService.getReceivables(query());

    expect(result.items.map((item) => item.tier)).toEqual(['CRITICAL', 'CRITICAL', 'WATCH']);
    expect(result.summary.customerCount).toBe(3);
    expect(result.summary.customersWithBalance).toBe(3);
    expect(result.summary.customersOverdue).toBe(3);
    expect(result.summary.atRiskCount).toBe(2);
    expect(result.summary.totalOutstanding).toBe('1000.00');
    expect(result.tierCounts.CRITICAL).toBe(2);
    expect(result.tierCounts.WATCH).toBe(1);
  });

  describe('month filter', () => {
    beforeEach(() => {
      repositoryMock.loadReceivableRecords.mockResolvedValue({
        customers: [alice, bilal],
        debts: [
          // Due in June, half paid.
          makeDebt({
            dueDate: businessDate('2026-06-15'),
            originalAmount: new Decimal('200.00'),
            paymentAllocations: [makePaymentAllocation('100.00')],
          }),
          // Due in July, untouched.
          makeDebt({
            id: '55555555-5555-4555-8555-555555555553',
            dueDate: businessDate('2026-07-20'),
            originalAmount: new Decimal('500.00'),
          }),
        ],
        plans: [
          makePlan({
            installments: [
              makeInstallment(1, '2026-06-10', '100.00', {
                paymentAllocations: [makePaymentAllocation('100.00')],
              }),
              makeInstallment(2, '2026-07-10', '100.00'),
              makeInstallment(3, '2026-09-10', '100.00'),
            ],
          }),
        ],
        payments: [
          makePayment(alice.id, '2026-06-20', '100.00', '88888888-8888-4888-8888-888888888881'),
          makePayment(bilal.id, '2026-06-09', '100.00', '88888888-8888-4888-8888-888888888882'),
        ],
      });
    });

    it('scopes amounts to obligations due in the month', async () => {
      const result = await ReceivablesService.getReceivables(
        query({ month: '2026-07', sortBy: 'name', sortOrder: 'asc' })
      );
      const [aliceRow, bilalRow] = result.items;

      // Only the July debt counts; June's 200.00 debt is out of scope.
      expect(aliceRow.totalObligated).toBe('500.00');
      expect(aliceRow.totalPaid).toBe('0.00');
      expect(aliceRow.outstanding).toBe('500.00');
      expect(aliceRow.billsTotal).toBe(1);
      expect(aliceRow.nextDueDate).toBe('2026-07-20');

      // Only installment 2 counts, so the plan contributes 100.00, not 300.00.
      expect(bilalRow.totalObligated).toBe('100.00');
      expect(bilalRow.outstanding).toBe('100.00');
      expect(bilalRow.billsTotal).toBe(1);
      expect(bilalRow.billsPaid).toBe(0);
      expect(bilalRow.activePlanCount).toBe(1);
    });

    it('scopes payment activity to the month', async () => {
      const july = await ReceivablesService.getReceivables(
        query({ month: '2026-07', sortBy: 'name', sortOrder: 'asc' })
      );
      expect(july.items[0].lastPaymentDate).toBeNull();
      expect(july.items[0].paymentCount).toBe(0);

      const june = await ReceivablesService.getReceivables(
        query({ month: '2026-06', sortBy: 'name', sortOrder: 'asc' })
      );
      expect(june.items[0].lastPaymentDate).toBe('2026-06-20');
      expect(june.items[0].paymentCount).toBe(1);
      expect(june.items[0].totalObligated).toBe('200.00');
      expect(june.items[0].totalPaid).toBe('100.00');
      expect(june.items[0].paidRatioPercent).toBe('50');
    });

    it('reports customers with nothing due in the month as NO_ACTIVITY', async () => {
      const result = await ReceivablesService.getReceivables(
        query({ month: '2026-08', sortBy: 'name', sortOrder: 'asc' })
      );

      expect(result.items.map((item) => item.tier)).toEqual(['NO_ACTIVITY', 'NO_ACTIVITY']);
      expect(result.summary.totalOutstanding).toBe('0.00');
      expect(result.tierCounts.NO_ACTIVITY).toBe(2);
    });

    it('covers the full month including a 31-day end date', async () => {
      const result = await ReceivablesService.getReceivables(
        query({ month: '2026-07', sortBy: 'name', sortOrder: 'asc' })
      );

      expect(result.businessDate).toBe('2026-07-28');
      // The 2026-07-20 debt is inside the window and still counted as overdue today.
      expect(result.items[0].overdueItemCount).toBe(1);
      expect(result.items[0].overdueAmount).toBe('500.00');
    });

    it('leaves unfiltered totals on plan level when no month is given', async () => {
      const result = await ReceivablesService.getReceivables(
        query({ sortBy: 'name', sortOrder: 'asc' })
      );
      const [, bilalRow] = result.items;

      expect(bilalRow.totalObligated).toBe('300.00');
      expect(bilalRow.billsTotal).toBe(3);
      expect(bilalRow.billsPaid).toBe(1);
    });
  });

  it('filters by search and balance, and paginates without changing tier counts', async () => {
    repositoryMock.loadReceivableRecords.mockResolvedValue({
      customers: [alice, bilal, carla],
      debts: [makeDebt({ paymentAllocations: [makePaymentAllocation('200.00')] })],
      plans: [makePlan()],
      payments: [makePayment(alice.id, '2026-07-05', '200.00')],
    });

    const searched = await ReceivablesService.getReceivables(query({ search: '7122' }));
    expect(searched.items).toHaveLength(1);
    expect(searched.items[0].customer.name).toBe('Bilal Nassar');

    const withBalance = await ReceivablesService.getReceivables(query({ onlyWithBalance: true }));
    expect(withBalance.items.map((item) => item.customer.name)).not.toContain('Carla Rizk');

    const paged = await ReceivablesService.getReceivables(query({ limit: 1, page: 2 }));
    expect(paged.items).toHaveLength(1);
    expect(paged.pagination).toEqual({ page: 2, limit: 1, total: 3, totalPages: 3 });

    const tierFiltered = await ReceivablesService.getReceivables(query({ tier: ['NO_ACTIVITY'] }));
    expect(tierFiltered.items).toHaveLength(1);
    expect(tierFiltered.tierCounts.WATCH).toBe(1);
    expect(tierFiltered.summary.customerCount).toBe(1);
  });

  it('matches Arabic spelling variants through the shared search result ids', async () => {
    repositoryMock.loadReceivableRecords.mockResolvedValue({
      customers: [ahmad],
      debts: [],
      plans: [],
      payments: [],
    });

    const result = await ReceivablesService.getReceivables(query({ search: 'أحمد' }));

    expect(result.items.map((item) => item.customer.name)).toEqual(['احمد']);
  });

  it('matches non-contiguous customer-name tokens through the shared search result ids', async () => {
    repositoryMock.loadReceivableRecords.mockResolvedValue({
      customers: [mohammad, bilal],
      debts: [],
      plans: [],
      payments: [],
    });

    const result = await ReceivablesService.getReceivables(query({ search: 'محمد عمار' }));

    expect(result.items.map((item) => item.customer.name)).toEqual(['محمد سالم عمار']);
  });

  it.each([undefined, '   '])('does not filter for a blank search term (%j)', async (search) => {
    repositoryMock.loadReceivableRecords.mockResolvedValue({
      customers: [alice, bilal, carla],
      debts: [],
      plans: [],
      payments: [],
    });

    const result = await ReceivablesService.getReceivables(query({ search }));

    expect(result.items).toHaveLength(3);
  });

  it('returns no items and computes zero tier counts for an unmatched base search', async () => {
    repositoryMock.loadReceivableRecords.mockResolvedValue({
      customers: [alice, bilal, carla],
      debts: [],
      plans: [],
      payments: [],
    });

    const result = await ReceivablesService.getReceivables(
      query({ search: 'لا يوجد', tier: ['NO_ACTIVITY'] })
    );

    expect(result.items).toEqual([]);
    expect(result.tierCounts).toEqual({
      NO_ACTIVITY: 0,
      CURRENT: 0,
      WATCH: 0,
      LATE: 0,
      SEVERE: 0,
      CRITICAL: 0,
    });
  });
});
