import {
  DebtKind,
  DebtStatus,
  FinancialCorrectionAction,
  FinancialCorrectionRecordType,
  FinancialCorrectionSourceScreen,
  PaymentMethod,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../../lib/errors';
import {
  FinancialRecordAlreadyPaidError,
  FinancialRecordCancelledError,
  OverpaymentError,
  PaymentIdempotencyConflictError,
} from '../domain/financial-errors';
import { DebtWithDetails } from './debts.repository';
import { DebtsService } from './debts.service';

const tx = { id: 'tx' };

const {
  correctionAuditMock,
  repositoryMock,
  prepaidRepositoryMock,
  verifyAccountPasswordMock,
  verifyAdminPasswordMock,
} = vi.hoisted(() => ({
  correctionAuditMock: vi.fn(),
  prepaidRepositoryMock: {
    createForDebt: vi.fn(),
  },
  repositoryMock: {
    findActiveCustomerById: vi.fn(),
    createDebt: vi.fn(),
    findDebtById: vi.fn(),
    findUserIdentity: vi.fn(),
    listDebtsByCustomer: vi.fn(),
    createPayment: vi.fn(),
    createDebtPaymentAllocation: vi.fn(),
    updateDebtStatus: vi.fn(),
    updateDebtDetails: vi.fn(),
    cancelDebt: vi.fn(),
    findPaymentByIdempotencyKey: vi.fn(),
  },
  verifyAccountPasswordMock: vi.fn(),
  verifyAdminPasswordMock: vi.fn(),
}));

vi.mock('../prepaid/prepaid.repository', () => ({
  PrepaidRepository: prepaidRepositoryMock,
}));

vi.mock('./debts.repository', () => ({
  DebtsRepository: repositoryMock,
}));

vi.mock('../authorization/account-password', () => ({
  verifyAccountPassword: verifyAccountPasswordMock,
  verifyAdminPasswordForCorrection: verifyAdminPasswordMock,
}));

vi.mock('../corrections/correction-audit', () => ({
  writeFinancialCorrectionAudit: correctionAuditMock,
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

type DebtAllocationFixture = DebtWithDetails['paymentAllocations'][number];

function makeDebt(overrides: Record<string, unknown> = {}): DebtWithDetails {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    customerId: customer.id,
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
    },
    description: 'Refrigerator',
    originalAmount: new Decimal('600.00'),
    dueDate: new Date(Date.UTC(2026, 7, 10)),
    status: DebtStatus.UNPAID,
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
    paymentAllocations: [],
    ...overrides,
  } as unknown as DebtWithDetails;
}

function makeAllocation(amount: string, paymentOverrides: Record<string, unknown> = {}): DebtAllocationFixture {
  const payment = {
    id: `payment-${amount}`,
    customerId: customer.id,
    totalAmount: new Decimal(amount),
    paymentDate: new Date(Date.UTC(2026, 6, 24)),
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
    createdAt: new Date('2026-07-24T10:00:00.000Z'),
    voidedAt: null,
    voidedById: null,
    voidedBy: null,
    voidReason: null,
    allocations: [] as unknown[],
    ...paymentOverrides,
  };
  const allocation = {
    id: `allocation-${amount}`,
    paymentId: payment.id,
    payment,
    debtId: '33333333-3333-4333-8333-333333333333',
    installmentId: null,
    amount: new Decimal(amount),
    createdAt: new Date('2026-07-24T10:00:00.000Z'),
  };
  payment.allocations = [allocation];
  return allocation as unknown as DebtAllocationFixture;
}

describe('DebtsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAccountPasswordMock.mockResolvedValue(undefined);
    verifyAdminPasswordMock.mockResolvedValue(undefined);
    correctionAuditMock.mockResolvedValue(undefined);
    repositoryMock.findUserIdentity.mockResolvedValue({
      id: adminUser.userId,
      fullName: 'Admin User',
      username: 'admin',
    });
  });

  it('creates a debt for an existing active customer and serializes money/date values', async () => {
    repositoryMock.findActiveCustomerById.mockResolvedValue(customer);
    repositoryMock.createDebt.mockResolvedValue(makeDebt());

    const result = await DebtsService.createDebt(
      customer.id,
      {
        amount: '600.00',
        description: 'Refrigerator',
        dueDate: '2026-08-10',
        notes: null,
      },
      adminUser
    );

    expect(repositoryMock.createDebt).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: customer.id,
        originalAmount: expect.any(Decimal),
        status: DebtStatus.UNPAID,
        createdById: adminUser.userId,
      })
    );
    expect(result.originalAmount).toBe('600.00');
    expect(result.totalPaid).toBe('0.00');
    expect(result.remainingBalance).toBe('600.00');
    expect(result.dueDate).toBe('2026-08-10');
    expect(result.status).toBe(DebtStatus.UNPAID);
  });

  it('requires the customer to exist before debt creation', async () => {
    repositoryMock.findActiveCustomerById.mockResolvedValue(null);

    await expect(
      DebtsService.createDebt(
        customer.id,
        {
          amount: '600.00',
          description: 'Refrigerator',
          dueDate: '2026-08-10',
          notes: null,
        },
        adminUser
      )
    ).rejects.toThrow(NotFoundError);
    expect(repositoryMock.createDebt).not.toHaveBeenCalled();
  });

  it('creates a prepaid purchase and initial payment atomically', async () => {
    const allocation = makeAllocation('100.00');
    const prepaidDebt = makeDebt({
      kind: DebtKind.PREPAID_PURCHASE,
      description: 'Air conditioner',
      originalAmount: new Decimal('400.00'),
      dueDate: new Date(Date.UTC(2026, 6, 24)),
      paymentAllocations: [allocation],
      status: DebtStatus.PARTIALLY_PAID,
    });
    repositoryMock.findActiveCustomerById.mockResolvedValue(customer);
    repositoryMock.createDebt.mockResolvedValue(makeDebt({
      id: prepaidDebt.id,
      kind: DebtKind.PREPAID_PURCHASE,
      description: 'Air conditioner',
      originalAmount: new Decimal('400.00'),
      dueDate: new Date(Date.UTC(2026, 6, 24)),
    }));
    repositoryMock.createPayment.mockResolvedValue(allocation.payment);
    repositoryMock.createDebtPaymentAllocation.mockResolvedValue(allocation);
    repositoryMock.findDebtById.mockResolvedValue(prepaidDebt);
    repositoryMock.updateDebtStatus.mockResolvedValue(prepaidDebt);

    const result = await DebtsService.createPrepaidPurchase(customer.id, {
      itemName: 'Air conditioner',
      paymentAmount: '100.00',
      fullAmount: '400.00',
      notes: 'Customer will collect later',
    }, adminUser);

    expect(repositoryMock.createDebt).toHaveBeenCalledWith(expect.objectContaining({
      kind: DebtKind.PREPAID_PURCHASE,
      originalAmount: expect.any(Decimal),
      status: DebtStatus.UNPAID,
    }), tx);
    expect(repositoryMock.createPayment).toHaveBeenCalledWith(tx, expect.objectContaining({
      totalAmount: expect.any(Decimal),
      paymentMethod: PaymentMethod.CASH,
    }));
    expect(repositoryMock.createDebtPaymentAllocation).toHaveBeenCalledWith(tx, expect.objectContaining({
      debtId: prepaidDebt.id,
      amount: expect.any(Decimal),
    }));
    // The delivery companion row is part of the same atomic write.
    expect(prepaidRepositoryMock.createForDebt).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ debtId: prepaidDebt.id })
    );
    expect(result).toMatchObject({
      kind: DebtKind.PREPAID_PURCHASE,
      originalAmount: '400.00',
      totalPaid: '100.00',
      remainingBalance: '300.00',
      // Admin debt is the cash the business is holding (100), not the unpaid
      // remainder (300). If the customer walks away, 100 is the refund.
      adminDebt: '-100.00',
      status: DebtStatus.PARTIALLY_PAID,
    });
  });

  it('does not mark a prepaid purchase overdue', async () => {
    repositoryMock.findDebtById.mockResolvedValue(makeDebt({
      kind: DebtKind.PREPAID_PURCHASE,
      originalAmount: new Decimal('400.00'),
      dueDate: new Date(Date.UTC(2026, 5, 1)),
      status: DebtStatus.PARTIALLY_PAID,
      paymentAllocations: [makeAllocation('100.00')],
    }));

    const result = await DebtsService.getDebt('33333333-3333-4333-8333-333333333333');

    expect(result.status).toBe(DebtStatus.PARTIALLY_PAID);
  });

  it('calculates overdue status on reads without mutating stored status', async () => {
    repositoryMock.findDebtById.mockResolvedValue(
      makeDebt({
        dueDate: new Date(Date.UTC(2026, 6, 1)),
        status: DebtStatus.UNPAID,
      })
    );

    const result = await DebtsService.getDebt('33333333-3333-4333-8333-333333333333');

    expect(result.status).toBe(DebtStatus.OVERDUE);
    expect(result.storedStatus).toBe(DebtStatus.UNPAID);
    expect(repositoryMock.updateDebtStatus).not.toHaveBeenCalled();
  });

  it('records partial and full debt payments with allocation rows and updated status', async () => {
    const partialAllocation = makeAllocation('200.00');
    const partialDebt = makeDebt({ paymentAllocations: [partialAllocation] });

    repositoryMock.findDebtById
      .mockResolvedValueOnce(makeDebt())
      .mockResolvedValueOnce(partialDebt);
    repositoryMock.findPaymentByIdempotencyKey.mockResolvedValue(null);
    repositoryMock.createPayment.mockResolvedValue(partialAllocation.payment);
    repositoryMock.createDebtPaymentAllocation.mockResolvedValue(partialAllocation);
    repositoryMock.updateDebtStatus.mockResolvedValue(
      makeDebt({
        status: DebtStatus.PARTIALLY_PAID,
        paymentAllocations: [partialAllocation],
      })
    );

    const partialResult = await DebtsService.recordDebtPayment(
      '33333333-3333-4333-8333-333333333333',
      {
        amount: '200.00',
        paymentDate: '2026-07-24',
        paymentMethod: PaymentMethod.CASH,
        reference: null,
        notes: null,
        idempotencyKey: 'partial-key-123',
      },
      adminUser
    );

    expect(repositoryMock.createPayment).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        totalAmount: expect.any(Decimal),
        idempotencyKey: 'partial-key-123',
      })
    );
    expect(repositoryMock.createDebtPaymentAllocation).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        debtId: '33333333-3333-4333-8333-333333333333',
        amount: expect.any(Decimal),
      })
    );
    expect(partialResult.totalPaid).toBe('200.00');
    expect(partialResult.remainingBalance).toBe('400.00');
    expect(partialResult.status).toBe(DebtStatus.PARTIALLY_PAID);

    vi.clearAllMocks();
    const paidAllocations = [makeAllocation('200.00'), makeAllocation('400.00')];
    repositoryMock.findDebtById
      .mockResolvedValueOnce(makeDebt({ paymentAllocations: [paidAllocations[0]] }))
      .mockResolvedValueOnce(makeDebt({ paymentAllocations: paidAllocations }));
    repositoryMock.findPaymentByIdempotencyKey.mockResolvedValue(null);
    repositoryMock.createPayment.mockResolvedValue(paidAllocations[1].payment);
    repositoryMock.createDebtPaymentAllocation.mockResolvedValue(paidAllocations[1]);
    repositoryMock.updateDebtStatus.mockResolvedValue(
      makeDebt({
        status: DebtStatus.PAID,
        paymentAllocations: paidAllocations,
      })
    );

    const paidResult = await DebtsService.recordDebtPayment(
      '33333333-3333-4333-8333-333333333333',
      {
        amount: '400.00',
        paymentDate: '2026-07-24',
        paymentMethod: PaymentMethod.CASH,
        reference: null,
        notes: null,
        idempotencyKey: 'full-key-123',
      },
      adminUser
    );

    expect(paidResult.totalPaid).toBe('600.00');
    expect(paidResult.remainingBalance).toBe('0.00');
    expect(paidResult.status).toBe(DebtStatus.PAID);
  });

  it('rejects overpayment, cancelled debt payment, and paid debt payment', async () => {
    repositoryMock.findDebtById.mockResolvedValue(makeDebt());
    repositoryMock.findPaymentByIdempotencyKey.mockResolvedValue(null);
    await expect(
      DebtsService.recordDebtPayment(
        '33333333-3333-4333-8333-333333333333',
        {
          amount: '600.01',
          paymentDate: '2026-07-24',
          paymentMethod: PaymentMethod.CASH,
          reference: null,
          notes: null,
          idempotencyKey: null,
        },
        adminUser
      )
    ).rejects.toThrow(OverpaymentError);

    repositoryMock.findDebtById.mockResolvedValue(makeDebt({ status: DebtStatus.CANCELLED }));
    await expect(
      DebtsService.recordDebtPayment(
        '33333333-3333-4333-8333-333333333333',
        {
          amount: '1.00',
          paymentDate: '2026-07-24',
          paymentMethod: PaymentMethod.CASH,
          reference: null,
          notes: null,
          idempotencyKey: null,
        },
        adminUser
      )
    ).rejects.toThrow(FinancialRecordCancelledError);

    repositoryMock.findDebtById.mockResolvedValue(
      makeDebt({ paymentAllocations: [makeAllocation('600.00')] })
    );
    await expect(
      DebtsService.recordDebtPayment(
        '33333333-3333-4333-8333-333333333333',
        {
          amount: '1.00',
          paymentDate: '2026-07-24',
          paymentMethod: PaymentMethod.CASH,
          reference: null,
          notes: null,
          idempotencyKey: null,
        },
        adminUser
      )
    ).rejects.toThrow(FinancialRecordAlreadyPaidError);
  });

  it('returns existing debt result for same idempotent replay and rejects conflicting replay', async () => {
    const existingAllocation = makeAllocation('200.00', {
      idempotencyKey: 'same-key-123',
    });

    repositoryMock.findDebtById.mockResolvedValue(makeDebt({ paymentAllocations: [existingAllocation] }));
    repositoryMock.findPaymentByIdempotencyKey.mockResolvedValue(existingAllocation.payment);

    const sameResult = await DebtsService.recordDebtPayment(
      '33333333-3333-4333-8333-333333333333',
      {
        amount: '200.00',
        paymentDate: '2026-07-24',
        paymentMethod: PaymentMethod.CASH,
        reference: null,
        notes: null,
        idempotencyKey: 'same-key-123',
      },
      adminUser
    );

    expect(sameResult.totalPaid).toBe('200.00');
    expect(repositoryMock.createPayment).not.toHaveBeenCalled();

    await expect(
      DebtsService.recordDebtPayment(
        '33333333-3333-4333-8333-333333333333',
        {
          amount: '201.00',
          paymentDate: '2026-07-24',
          paymentMethod: PaymentMethod.CASH,
          reference: null,
          notes: null,
          idempotencyKey: 'same-key-123',
        },
        adminUser
      )
    ).rejects.toThrow(PaymentIdempotencyConflictError);
  });

  it('corrects debt details and amount after admin password verification', async () => {
    repositoryMock.findDebtById.mockResolvedValue(makeDebt());
    repositoryMock.updateDebtDetails.mockResolvedValue(
      makeDebt({
        description: 'Updated refrigerator',
        originalAmount: new Decimal('650.00'),
        dueDate: new Date(Date.UTC(2026, 7, 15)),
        notes: 'Updated notes',
      })
    );

    const updated = await DebtsService.updateDebt(
      '33333333-3333-4333-8333-333333333333',
      {
        originalAmount: '650.00',
        description: 'Updated refrigerator',
        dueDate: '2026-08-15',
        notes: 'Updated notes',
        reason: 'Original invoice amount was corrected',
        sourceScreen: FinancialCorrectionSourceScreen.CUSTOMER_PROFILE,
        accountPassword: 'admin-password',
      },
      adminUser
    );

    expect(verifyAdminPasswordMock).toHaveBeenCalledWith(adminUser.userId, 'admin-password', {
      action: 'CORRECT_DEBT',
      recordType: FinancialCorrectionRecordType.DEBT,
      recordId: '33333333-3333-4333-8333-333333333333',
    });
    expect(repositoryMock.updateDebtDetails).toHaveBeenCalledWith(
      tx,
      '33333333-3333-4333-8333-333333333333',
      expect.objectContaining({
        originalAmount: expect.any(Decimal),
        description: 'Updated refrigerator',
        dueDate: expect.any(Date),
        notes: 'Updated notes',
      })
    );
    expect(updated.description).toBe('Updated refrigerator');
    expect(updated.originalAmount).toBe('650.00');
    expect(updated.dueDate).toBe('2026-08-15');
    expect(correctionAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recordType: FinancialCorrectionRecordType.DEBT,
        recordId: '33333333-3333-4333-8333-333333333333',
        action: FinancialCorrectionAction.CORRECT_AMOUNT,
        correctedById: adminUser.userId,
        reason: 'Original invoice amount was corrected',
        sourceScreen: FinancialCorrectionSourceScreen.CUSTOMER_PROFILE,
      }),
      tx
    );
  });

  it('rejects correcting a debt amount below already paid allocations', async () => {
    repositoryMock.findDebtById.mockResolvedValue(
      makeDebt({ paymentAllocations: [makeAllocation('500.00')] })
    );

    await expect(
      DebtsService.correctDebt(
        '33333333-3333-4333-8333-333333333333',
        {
          originalAmount: '499.99',
          description: 'Refrigerator',
          dueDate: '2026-08-10',
          notes: null,
          reason: 'Correction would break paid balance',
          sourceScreen: FinancialCorrectionSourceScreen.CUSTOMER_PROFILE,
          accountPassword: 'admin-password',
        },
        adminUser
      )
    ).rejects.toThrow('Debt amount cannot be lower than the amount already paid');

    expect(repositoryMock.updateDebtDetails).not.toHaveBeenCalled();
    expect(correctionAuditMock).not.toHaveBeenCalled();
  });

  it('cancels unpaid debts after account-password verification and rejects debts with payments', async () => {
    repositoryMock.findDebtById.mockResolvedValue(makeDebt());
    repositoryMock.cancelDebt.mockResolvedValue(
      makeDebt({
        status: DebtStatus.CANCELLED,
        cancelledAt: new Date('2026-07-24T11:00:00.000Z'),
        cancelledBy: {
          id: adminUser.userId,
          fullName: 'Admin User',
          username: 'admin',
        },
        cancelReason: 'Customer returned product',
      })
    );

    const cancelled = await DebtsService.cancelDebt(
      '33333333-3333-4333-8333-333333333333',
      { reason: 'Customer returned product', accountPassword: 'admin-password' },
      adminUser
    );

    expect(cancelled.status).toBe(DebtStatus.CANCELLED);
    expect(cancelled.cancellation?.reason).toBe('Customer returned product');
    expect(verifyAccountPasswordMock).toHaveBeenCalledWith(adminUser.userId, 'admin-password');

    repositoryMock.findDebtById.mockResolvedValue(makeDebt({ paymentAllocations: [makeAllocation('1.00')] }));
    await expect(
      DebtsService.cancelDebt(
        '33333333-3333-4333-8333-333333333333',
        { reason: 'Customer returned product', accountPassword: 'admin-password' },
        adminUser
      )
    ).rejects.toThrow('Debt with payments requires a dedicated reversal workflow');
  });

  it('allows admins to cancel prepaid purchases with payment history after account-password verification', async () => {
    const prepaidDebt = makeDebt({
      kind: DebtKind.PREPAID_PURCHASE,
      status: DebtStatus.PARTIALLY_PAID,
      paymentAllocations: [makeAllocation('100.00')],
    });
    repositoryMock.findDebtById.mockResolvedValue(prepaidDebt);
    repositoryMock.cancelDebt.mockResolvedValue(
      makeDebt({
        ...prepaidDebt,
        status: DebtStatus.CANCELLED,
        cancelledAt: new Date('2026-07-24T11:00:00.000Z'),
        cancelledBy: {
          id: adminUser.userId,
          fullName: 'Admin User',
          username: 'admin',
        },
        cancelReason: 'Customer cancelled reserved item',
      })
    );

    const cancelled = await DebtsService.cancelDebt(
      prepaidDebt.id,
      { reason: 'Customer cancelled reserved item', accountPassword: 'admin-password' },
      adminUser
    );

    expect(verifyAccountPasswordMock).toHaveBeenCalledWith(adminUser.userId, 'admin-password');
    expect(repositoryMock.cancelDebt).toHaveBeenCalledWith(tx, prepaidDebt.id, expect.objectContaining({
      cancelledById: adminUser.userId,
      cancelReason: 'Customer cancelled reserved item',
    }));
    expect(cancelled.status).toBe(DebtStatus.CANCELLED);
    expect(cancelled.kind).toBe(DebtKind.PREPAID_PURCHASE);
  });
});
