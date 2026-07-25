import { InstallmentPlanFrequency, InstallmentPlanStatus, InstallmentStatus, PaymentMethod } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../../lib/errors';
import {
  FinancialRecordAlreadyPaidError,
  FinancialRecordCancelledError,
  OverpaymentError,
  PaymentIdempotencyConflictError,
} from '../domain/financial-errors';
import {
  InstallmentPlanWithDetails,
} from './installment-plans.repository';
import { InstallmentPlansService } from './installment-plans.service';

const tx = { id: 'tx' };

const { repositoryMock } = vi.hoisted(() => ({
  repositoryMock: {
    findActiveCustomerById: vi.fn(),
    createPlanWithInstallments: vi.fn(),
    findPlanById: vi.fn(),
    listPlansByCustomer: vi.fn(),
    createPayment: vi.fn(),
    createPaymentAllocations: vi.fn(),
    updateInstallmentStatus: vi.fn(),
    updatePlanStatus: vi.fn(),
    cancelPlan: vi.fn(),
    findPaymentByIdempotencyKey: vi.fn(),
  },
}));

vi.mock('./installment-plans.repository', () => ({
  InstallmentPlansRepository: repositoryMock,
}));

vi.mock('../index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../index')>();
  return {
    ...actual,
    todayInBusinessTimezone: vi.fn(() => '2026-07-24'),
    runFinancialTransaction: vi.fn((operation: (transactionClient: unknown) => unknown) => operation(tx)),
  };
});

const adminUser = { userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' };
const customer = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Ali Ahmad',
  phone: '70123456',
  isActive: true,
  deletedAt: null,
};
const planId = '55555555-5555-4555-8555-555555555555';

type InstallmentFixture = InstallmentPlanWithDetails['installments'][number];
type InstallmentAllocationFixture = InstallmentFixture['paymentAllocations'][number];

function businessDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function makeAllocation(
  installmentId: string,
  amount: string,
  paymentOverrides: Record<string, unknown> = {}
): InstallmentAllocationFixture {
  const payment = {
    id: `payment-${installmentId}-${amount}`,
    customerId: customer.id,
    totalAmount: new Decimal(amount),
    paymentDate: businessDate('2026-08-15'),
    paymentMethod: PaymentMethod.CASH,
    reference: null,
    notes: null,
    idempotencyKey: null,
    createdById: adminUser.userId,
    createdBy: {
      id: adminUser.userId,
      fullName: 'Admin User',
      username: 'admin',
    },
    createdAt: new Date('2026-08-15T10:00:00.000Z'),
    voidedAt: null,
    voidedById: null,
    voidedBy: null,
    voidReason: null,
    allocations: [] as unknown[],
    ...paymentOverrides,
  };
  const allocation = {
    id: `allocation-${installmentId}-${amount}`,
    paymentId: payment.id,
    payment,
    debtId: null,
    installmentId,
    amount: new Decimal(amount),
    createdAt: new Date('2026-08-15T10:00:00.000Z'),
  };
  payment.allocations = [allocation];
  return allocation as unknown as InstallmentAllocationFixture;
}

function makeInstallment(
  installmentNumber: number,
  dueDate: string,
  amountDue = '100.00',
  overrides: Record<string, unknown> = {}
): InstallmentFixture {
  return {
    id: `66666666-6666-4666-8666-66666666666${installmentNumber}`,
    installmentPlanId: planId,
    installmentNumber,
    dueDate: businessDate(dueDate),
    amountDue: new Decimal(amountDue),
    status: InstallmentStatus.PENDING,
    paidDate: null,
    createdAt: new Date('2026-07-24T09:00:00.000Z'),
    updatedAt: new Date('2026-07-24T09:00:00.000Z'),
    paymentAllocations: [],
    ...overrides,
  } as unknown as InstallmentFixture;
}

function makePlan(overrides: Record<string, unknown> = {}): InstallmentPlanWithDetails {
  return {
    id: planId,
    customerId: customer.id,
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
    },
    description: 'Refrigerator',
    totalAmount: new Decimal('300.00'),
    startDate: businessDate('2026-08-01'),
    installmentCount: 3,
    frequency: InstallmentPlanFrequency.MONTHLY,
    status: InstallmentPlanStatus.ACTIVE,
    notes: null,
    createdById: adminUser.userId,
    createdBy: {
      id: adminUser.userId,
      fullName: 'Admin User',
      username: 'admin',
    },
    createdAt: new Date('2026-07-24T09:00:00.000Z'),
    updatedAt: new Date('2026-07-24T09:00:00.000Z'),
    cancelledAt: null,
    cancelledById: null,
    cancelledBy: null,
    cancelReason: null,
    installments: [
      makeInstallment(1, '2026-08-01'),
      makeInstallment(2, '2026-09-01'),
      makeInstallment(3, '2026-10-01'),
    ],
    ...overrides,
  } as unknown as InstallmentPlanWithDetails;
}

describe('InstallmentPlansService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a valid monthly plan with exact generated schedule', async () => {
    repositoryMock.findActiveCustomerById.mockResolvedValue(customer);
    repositoryMock.createPlanWithInstallments.mockImplementation(
      async (
        _transactionClient: unknown,
        planData: Record<string, unknown>,
        installments: Array<Record<string, unknown>>
      ) =>
        makePlan({
          totalAmount: planData.totalAmount,
          startDate: planData.startDate,
          installmentCount: planData.installmentCount,
          installments: installments.map((installment, index) =>
            makeInstallment(
              index + 1,
              ['2026-08-01', '2026-09-01', '2026-10-01'][index],
              installment.amountDue instanceof Decimal ? installment.amountDue.toFixed(2) : '0.00',
              {
                status: installment.status,
              }
            )
          ),
        })
    );

    const result = await InstallmentPlansService.createPlan(
      customer.id,
      {
        totalAmount: '300.00',
        description: 'Refrigerator',
        startDate: '2026-08-01',
        installmentCount: 3,
        frequency: InstallmentPlanFrequency.MONTHLY,
        notes: null,
      },
      adminUser
    );

    expect(repositoryMock.createPlanWithInstallments).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        customerId: customer.id,
        totalAmount: expect.any(Decimal),
        installmentCount: 3,
      }),
      expect.arrayContaining([
        expect.objectContaining({ installmentNumber: 1, amountDue: expect.any(Decimal) }),
      ])
    );
    expect(result.schedule.map((installment) => installment.dueDate)).toEqual([
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
    ]);
    expect(result.schedule.every((installment) => installment.amountDue === '100.00')).toBe(true);
    expect(result.totalAmount).toBe('300.00');
    expect(result.remainingBalance).toBe('300.00');
  });

  it('generates exact rounding and month-end schedules through Phase 3 generator', async () => {
    repositoryMock.findActiveCustomerById.mockResolvedValue(customer);
    const createdSchedules: Array<Array<Record<string, unknown>>> = [];
    repositoryMock.createPlanWithInstallments.mockImplementation(
      async (
        _transactionClient: unknown,
        planData: Record<string, unknown>,
        installments: Array<Record<string, unknown>>
      ) => {
        createdSchedules.push(installments);
        return makePlan({
          totalAmount: planData.totalAmount,
          startDate: planData.startDate,
          installmentCount: planData.installmentCount,
          installments: installments.map((installment, index) =>
            makeInstallment(
              index + 1,
              index === 1 ? '2026-02-28' : index === 2 ? '2026-03-31' : '2026-01-31',
              installment.amountDue instanceof Decimal ? installment.amountDue.toFixed(2) : '0.00'
            )
          ),
        });
      }
    );

    await InstallmentPlansService.createPlan(
      customer.id,
      {
        totalAmount: '100.00',
        description: 'Month end plan',
        startDate: '2026-01-31',
        installmentCount: 3,
        frequency: InstallmentPlanFrequency.MONTHLY,
        notes: null,
      },
      adminUser
    );

    expect(createdSchedules[0].map((installment) => (installment.amountDue as Decimal).toFixed(2))).toEqual([
      '33.33',
      '33.33',
      '33.34',
    ]);
    expect(createdSchedules[0].map((installment) => (installment.dueDate as Date).toISOString().slice(0, 10))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
  });

  it('requires an existing active customer before plan creation', async () => {
    repositoryMock.findActiveCustomerById.mockResolvedValue(null);

    await expect(
      InstallmentPlansService.createPlan(
        customer.id,
        {
          totalAmount: '300.00',
          description: 'Refrigerator',
          startDate: '2026-08-01',
          installmentCount: 3,
          frequency: InstallmentPlanFrequency.MONTHLY,
          notes: null,
        },
        adminUser
      )
    ).rejects.toThrow(NotFoundError);
  });

  it('records a payment across multiple installments oldest first and updates statuses', async () => {
    const firstAllocation = makeAllocation('66666666-6666-4666-8666-666666666661', '100.00');
    const secondAllocation = makeAllocation('66666666-6666-4666-8666-666666666662', '50.00');
    const afterPayment = makePlan({
      installments: [
        makeInstallment(1, '2026-08-01', '100.00', { paymentAllocations: [firstAllocation] }),
        makeInstallment(2, '2026-09-01', '100.00', { paymentAllocations: [secondAllocation] }),
        makeInstallment(3, '2026-10-01'),
      ],
    });

    repositoryMock.findPlanById
      .mockResolvedValueOnce(makePlan())
      .mockResolvedValueOnce(afterPayment)
      .mockResolvedValueOnce(afterPayment);
    repositoryMock.findPaymentByIdempotencyKey.mockResolvedValue(null);
    repositoryMock.createPayment.mockResolvedValue(firstAllocation.payment);
    repositoryMock.createPaymentAllocations.mockResolvedValue({ count: 2 });
    repositoryMock.updatePlanStatus.mockResolvedValue(afterPayment);

    const result = await InstallmentPlansService.recordPlanPayment(
      planId,
      {
        amount: '150.00',
        paymentDate: '2026-08-15',
        paymentMethod: PaymentMethod.CASH,
        reference: null,
        notes: null,
        idempotencyKey: 'plan-payment-key',
      },
      adminUser
    );

    expect(repositoryMock.createPaymentAllocations).toHaveBeenCalledWith(
      tx,
      [
        expect.objectContaining({
          installmentId: '66666666-6666-4666-8666-666666666661',
          amount: expect.any(Decimal),
        }),
        expect.objectContaining({
          installmentId: '66666666-6666-4666-8666-666666666662',
          amount: expect.any(Decimal),
        }),
      ]
    );
    expect(repositoryMock.updateInstallmentStatus).toHaveBeenCalledWith(
      tx,
      '66666666-6666-4666-8666-666666666661',
      expect.objectContaining({
        status: InstallmentStatus.PAID,
        paidDate: expect.any(Date),
      })
    );
    expect(repositoryMock.updateInstallmentStatus).toHaveBeenCalledWith(
      tx,
      '66666666-6666-4666-8666-666666666662',
      expect.objectContaining({
        status: InstallmentStatus.PARTIALLY_PAID,
        paidDate: null,
      })
    );
    expect(result.totalPaid).toBe('150.00');
    expect(result.remainingBalance).toBe('150.00');
    expect(result.schedule[0].status).toBe(InstallmentStatus.PAID);
    expect(result.schedule[1].status).toBe(InstallmentStatus.PARTIALLY_PAID);
  });

  it('rejects overpayment and completed/cancelled plan payments', async () => {
    repositoryMock.findPlanById.mockResolvedValue(makePlan());
    repositoryMock.findPaymentByIdempotencyKey.mockResolvedValue(null);
    await expect(
      InstallmentPlansService.recordPlanPayment(
        planId,
        {
          amount: '301.00',
          paymentDate: '2026-08-15',
          paymentMethod: PaymentMethod.CASH,
          reference: null,
          notes: null,
          idempotencyKey: null,
        },
        adminUser
      )
    ).rejects.toThrow(OverpaymentError);

    repositoryMock.findPlanById.mockResolvedValue(
      makePlan({
        status: InstallmentPlanStatus.CANCELLED,
      })
    );
    await expect(
      InstallmentPlansService.recordPlanPayment(
        planId,
        {
          amount: '1.00',
          paymentDate: '2026-08-15',
          paymentMethod: PaymentMethod.CASH,
          reference: null,
          notes: null,
          idempotencyKey: null,
        },
        adminUser
      )
    ).rejects.toThrow(FinancialRecordCancelledError);

    const paidInstallments = [
      makeInstallment(1, '2026-08-01', '100.00', {
        status: InstallmentStatus.PAID,
        paymentAllocations: [makeAllocation('66666666-6666-4666-8666-666666666661', '100.00')],
      }),
      makeInstallment(2, '2026-09-01', '100.00', {
        status: InstallmentStatus.PAID,
        paymentAllocations: [makeAllocation('66666666-6666-4666-8666-666666666662', '100.00')],
      }),
      makeInstallment(3, '2026-10-01', '100.00', {
        status: InstallmentStatus.PAID,
        paymentAllocations: [makeAllocation('66666666-6666-4666-8666-666666666663', '100.00')],
      }),
    ];
    repositoryMock.findPlanById.mockResolvedValue(
      makePlan({
        status: InstallmentPlanStatus.COMPLETED,
        installments: paidInstallments,
      })
    );
    await expect(
      InstallmentPlansService.recordPlanPayment(
        planId,
        {
          amount: '1.00',
          paymentDate: '2026-08-15',
          paymentMethod: PaymentMethod.CASH,
          reference: null,
          notes: null,
          idempotencyKey: null,
        },
        adminUser
      )
    ).rejects.toThrow(FinancialRecordAlreadyPaidError);
  });

  it('handles idempotent replay and conflict for plan payments', async () => {
    const existingAllocation = makeAllocation('66666666-6666-4666-8666-666666666661', '150.00', {
      idempotencyKey: 'same-plan-key',
    });
    const planWithPayment = makePlan({
      installments: [
        makeInstallment(1, '2026-08-01', '100.00', { paymentAllocations: [existingAllocation] }),
        makeInstallment(2, '2026-09-01'),
        makeInstallment(3, '2026-10-01'),
      ],
    });

    repositoryMock.findPlanById.mockResolvedValue(planWithPayment);
    repositoryMock.findPaymentByIdempotencyKey.mockResolvedValue(existingAllocation.payment);

    const replay = await InstallmentPlansService.recordPlanPayment(
      planId,
      {
        amount: '150.00',
        paymentDate: '2026-08-15',
        paymentMethod: PaymentMethod.CASH,
        reference: null,
        notes: null,
        idempotencyKey: 'same-plan-key',
      },
      adminUser
    );

    expect(replay.payments).toHaveLength(1);
    expect(repositoryMock.createPayment).not.toHaveBeenCalled();

    await expect(
      InstallmentPlansService.recordPlanPayment(
        planId,
        {
          amount: '151.00',
          paymentDate: '2026-08-15',
          paymentMethod: PaymentMethod.CASH,
          reference: null,
          notes: null,
          idempotencyKey: 'same-plan-key',
        },
        adminUser
      )
    ).rejects.toThrow(PaymentIdempotencyConflictError);
  });

  it('cancels eligible unpaid plans and rejects cancellation after payment', async () => {
    repositoryMock.findPlanById.mockResolvedValue(makePlan());
    repositoryMock.cancelPlan.mockResolvedValue(
      makePlan({
        status: InstallmentPlanStatus.CANCELLED,
        cancelledAt: new Date('2026-07-24T10:00:00.000Z'),
        cancelledBy: {
          id: adminUser.userId,
          fullName: 'Admin User',
          username: 'admin',
        },
        cancelReason: 'Agreement cancelled',
        installments: [
          makeInstallment(1, '2026-08-01', '100.00', { status: InstallmentStatus.CANCELLED }),
          makeInstallment(2, '2026-09-01', '100.00', { status: InstallmentStatus.CANCELLED }),
          makeInstallment(3, '2026-10-01', '100.00', { status: InstallmentStatus.CANCELLED }),
        ],
      })
    );

    const cancelled = await InstallmentPlansService.cancelPlan(
      planId,
      { reason: 'Agreement cancelled' },
      adminUser
    );

    expect(cancelled.status).toBe(InstallmentPlanStatus.CANCELLED);
    expect(cancelled.schedule.every((installment) => installment.status === InstallmentStatus.CANCELLED)).toBe(true);

    repositoryMock.findPlanById.mockResolvedValue(
      makePlan({
        installments: [
          makeInstallment(1, '2026-08-01', '100.00', {
            paymentAllocations: [makeAllocation('66666666-6666-4666-8666-666666666661', '1.00')],
          }),
          makeInstallment(2, '2026-09-01'),
          makeInstallment(3, '2026-10-01'),
        ],
      })
    );

    await expect(
      InstallmentPlansService.cancelPlan(planId, { reason: 'Agreement cancelled' }, adminUser)
    ).rejects.toThrow(FinancialRecordAlreadyPaidError);
  });
});
