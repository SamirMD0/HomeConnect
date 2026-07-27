import {
  DebtStatus,
  FinancialCorrectionAction,
  FinancialCorrectionRecordType,
  FinancialCorrectionSourceScreen,
  InstallmentPlanStatus,
  InstallmentStatus,
  PaymentMethod,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentsService } from './payments.service';

const tx = { id: 'tx' };

const {
  correctionAuditMock,
  debtsRepositoryMock,
  installmentPlansRepositoryMock,
  paymentsRepositoryMock,
  verifyAdminPasswordMock,
} = vi.hoisted(() => ({
  correctionAuditMock: vi.fn(),
  debtsRepositoryMock: {
    findDebtById: vi.fn(),
    updateDebtStatus: vi.fn(),
  },
  installmentPlansRepositoryMock: {
    findPlanById: vi.fn(),
    updateInstallmentStatus: vi.fn(),
    updatePlanStatus: vi.fn(),
  },
  paymentsRepositoryMock: {
    findUserIdentity: vi.fn(),
    findPaymentById: vi.fn(),
    voidPayment: vi.fn(),
    voidAllocationsForPayment: vi.fn(),
    linkAllocationsToCorrection: vi.fn(),
    updatePaymentDetails: vi.fn(),
    createReplacementPayment: vi.fn(),
    createDebtAllocation: vi.fn(),
    createInstallmentAllocations: vi.fn(),
    findInstallmentsByIds: vi.fn(),
  },
  verifyAdminPasswordMock: vi.fn(),
}));

vi.mock('../authorization/account-password', () => ({
  verifyAdminPasswordForCorrection: verifyAdminPasswordMock,
}));

vi.mock('../corrections/correction-audit', () => ({
  writeFinancialCorrectionAudit: correctionAuditMock,
}));

vi.mock('../debts/debts.repository', () => ({
  DebtsRepository: debtsRepositoryMock,
}));

vi.mock('../installment-plans/installment-plans.repository', () => ({
  InstallmentPlansRepository: installmentPlansRepositoryMock,
}));

vi.mock('./payments.repository', () => ({
  PaymentsRepository: paymentsRepositoryMock,
}));

vi.mock('../index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../index')>();
  return {
    ...actual,
    todayInBusinessTimezone: vi.fn(() => '2026-07-27'),
    runFinancialTransaction: vi.fn((operation: (transactionClient: unknown) => unknown) => operation(tx)),
  };
});

const adminUser = { userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' };
const customerId = '22222222-2222-4222-8222-222222222222';
const debtId = '33333333-3333-4333-8333-333333333333';
const paymentId = '55555555-5555-4555-8555-555555555555';
const planId = '88888888-8888-4888-8888-888888888888';
const firstInstallmentId = '99999999-9999-4999-8999-999999999991';
const secondInstallmentId = '99999999-9999-4999-8999-999999999992';

function makePayment(overrides: Record<string, unknown> = {}) {
  const allocation = {
    id: '66666666-6666-4666-8666-666666666666',
    paymentId,
    debtId,
    installmentId: null,
    installment: null,
    amount: new Decimal('200.00'),
    createdAt: new Date('2026-07-27T10:00:00.000Z'),
    voidedAt: null,
    voidedById: null,
    correctionId: null,
  };
  return {
    id: paymentId,
    customerId,
    customer: { id: customerId, name: 'Ali Ahmad', phone: '70123456' },
    totalAmount: new Decimal('200.00'),
    paymentDate: new Date(Date.UTC(2026, 6, 27)),
    paymentMethod: PaymentMethod.CASH,
    reference: null,
    notes: null,
    idempotencyKey: 'payment-key',
    createdById: adminUser.userId,
    createdBy: { id: adminUser.userId, fullName: 'Admin User', username: 'admin' },
    createdAt: new Date('2026-07-27T10:00:00.000Z'),
    voidedAt: null,
    voidedById: null,
    voidedBy: null,
    voidReason: null,
    allocations: [allocation],
    ...overrides,
  };
}

function makeDebtWithVoidedPayment() {
  return {
    id: debtId,
    customerId,
    customer: { id: customerId, name: 'Ali Ahmad', phone: '70123456' },
    description: 'Refrigerator',
    originalAmount: new Decimal('600.00'),
    dueDate: new Date(Date.UTC(2026, 7, 10)),
    status: DebtStatus.PARTIALLY_PAID,
    notes: null,
    createdById: adminUser.userId,
    createdBy: { id: adminUser.userId, fullName: 'Admin User', username: 'admin' },
    createdAt: new Date('2026-07-24T09:00:00.000Z'),
    updatedAt: new Date('2026-07-24T09:00:00.000Z'),
    cancelledAt: null,
    cancelledById: null,
    cancelledBy: null,
    cancelReason: null,
    paymentAllocations: [
      {
        id: '66666666-6666-4666-8666-666666666666',
        amount: new Decimal('200.00'),
        voidedAt: new Date('2026-07-27T10:05:00.000Z'),
        payment: { voidedAt: new Date('2026-07-27T10:05:00.000Z') },
      },
    ],
  };
}

function makePlanPayment(overrides: Record<string, unknown> = {}) {
  return makePayment({
    allocations: [
      {
        id: 'allocation-old-1',
        paymentId,
        debtId: null,
        installmentId: firstInstallmentId,
        installment: {
          id: firstInstallmentId,
          installmentPlanId: planId,
        },
        amount: new Decimal('200.00'),
        createdAt: new Date('2026-07-27T10:00:00.000Z'),
        voidedAt: null,
        voidedById: null,
        correctionId: null,
      },
    ],
    ...overrides,
  });
}

function makeTargetInstallment(id: string, installmentNumber: number, amountDue = '200.00') {
  return {
    id,
    installmentPlanId: planId,
    installmentNumber,
    dueDate: new Date(Date.UTC(2026, 7 + installmentNumber, 1)),
    amountDue: new Decimal(amountDue),
    status: InstallmentStatus.PENDING,
    paidDate: null,
    createdAt: new Date('2026-07-24T09:00:00.000Z'),
    updatedAt: new Date('2026-07-24T09:00:00.000Z'),
    installmentPlan: {
      id: planId,
      customerId,
      status: InstallmentPlanStatus.ACTIVE,
      cancelledAt: null,
    },
    paymentAllocations: [],
  };
}

function makePlanForStatusRefresh() {
  return {
    id: planId,
    customerId,
    customer: { id: customerId, name: 'Ali Ahmad', phone: '70123456' },
    description: 'Refrigerator plan',
    totalAmount: new Decimal('400.00'),
    startDate: new Date(Date.UTC(2026, 7, 1)),
    installmentCount: 2,
    frequency: 'MONTHLY',
    status: InstallmentPlanStatus.ACTIVE,
    notes: null,
    createdById: adminUser.userId,
    createdBy: { id: adminUser.userId, fullName: 'Admin User', username: 'admin' },
    createdAt: new Date('2026-07-24T09:00:00.000Z'),
    updatedAt: new Date('2026-07-24T09:00:00.000Z'),
    cancelledAt: null,
    cancelledById: null,
    cancelledBy: null,
    cancelReason: null,
    installments: [
      {
        id: firstInstallmentId,
        installmentPlanId: planId,
        installmentNumber: 1,
        dueDate: new Date(Date.UTC(2026, 7, 1)),
        amountDue: new Decimal('200.00'),
        status: InstallmentStatus.PENDING,
        paidDate: null,
        createdAt: new Date('2026-07-24T09:00:00.000Z'),
        updatedAt: new Date('2026-07-24T09:00:00.000Z'),
        paymentAllocations: [
          {
            id: 'allocation-new-1',
            amount: new Decimal('120.00'),
            voidedAt: null,
            payment: { voidedAt: null },
          },
        ],
      },
      {
        id: secondInstallmentId,
        installmentPlanId: planId,
        installmentNumber: 2,
        dueDate: new Date(Date.UTC(2026, 8, 1)),
        amountDue: new Decimal('200.00'),
        status: InstallmentStatus.PENDING,
        paidDate: null,
        createdAt: new Date('2026-07-24T09:00:00.000Z'),
        updatedAt: new Date('2026-07-24T09:00:00.000Z'),
        paymentAllocations: [
          {
            id: 'allocation-new-2',
            amount: new Decimal('80.00'),
            voidedAt: null,
            payment: { voidedAt: null },
          },
        ],
      },
    ],
  };
}

describe('PaymentsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdminPasswordMock.mockResolvedValue(undefined);
    paymentsRepositoryMock.findUserIdentity.mockResolvedValue({
      id: adminUser.userId,
      fullName: 'Admin User',
      username: 'admin',
    });
    correctionAuditMock.mockResolvedValue({ id: '77777777-7777-4777-8777-777777777777' });
  });

  it('voids payment and allocation rows, recomputes debt status, and writes audit', async () => {
    const voidedPayment = makePayment({
      voidedAt: new Date('2026-07-27T10:05:00.000Z'),
      voidedById: adminUser.userId,
      voidReason: 'Wrong customer payment',
    });
    paymentsRepositoryMock.findPaymentById.mockResolvedValue(makePayment());
    paymentsRepositoryMock.voidPayment.mockResolvedValue(voidedPayment);
    debtsRepositoryMock.findDebtById.mockResolvedValue(makeDebtWithVoidedPayment());
    debtsRepositoryMock.updateDebtStatus.mockResolvedValue(makeDebtWithVoidedPayment());

    const result = await PaymentsService.voidPayment(
      paymentId,
      {
        reason: 'Wrong customer payment',
        sourceScreen: FinancialCorrectionSourceScreen.LEDGER,
        accountPassword: 'admin-password',
      },
      adminUser
    );

    expect(verifyAdminPasswordMock).toHaveBeenCalledWith(adminUser.userId, 'admin-password', {
      action: 'VOID_PAYMENT',
      recordType: FinancialCorrectionRecordType.PAYMENT,
      recordId: paymentId,
    });
    expect(paymentsRepositoryMock.voidPayment).toHaveBeenCalledWith(
      tx,
      paymentId,
      expect.objectContaining({
        voidedById: adminUser.userId,
        voidReason: 'Wrong customer payment',
      })
    );
    expect(paymentsRepositoryMock.voidAllocationsForPayment).toHaveBeenCalledWith(
      tx,
      paymentId,
      expect.objectContaining({ voidedById: adminUser.userId })
    );
    expect(debtsRepositoryMock.updateDebtStatus).toHaveBeenCalledWith(tx, debtId, DebtStatus.UNPAID);
    expect(correctionAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recordType: FinancialCorrectionRecordType.PAYMENT,
        recordId: paymentId,
        action: FinancialCorrectionAction.VOID_PAYMENT,
        reason: 'Wrong customer payment',
      }),
      tx
    );
    expect(paymentsRepositoryMock.linkAllocationsToCorrection).toHaveBeenCalledWith(
      tx,
      paymentId,
      '77777777-7777-4777-8777-777777777777'
    );
    expect(result.action).toBe(FinancialCorrectionAction.VOID_PAYMENT);
    expect(result.voidedAt).not.toBeNull();
  });

  it('reallocates one installment-plan payment without voiding the payment header', async () => {
    const firstTarget = makeTargetInstallment(firstInstallmentId, 1);
    const secondTarget = makeTargetInstallment(secondInstallmentId, 2);
    paymentsRepositoryMock.findPaymentById
      .mockResolvedValueOnce(makePlanPayment())
      .mockResolvedValueOnce(makePlanPayment({
        allocations: [
          {
            id: 'allocation-old-1',
            paymentId,
            debtId: null,
            installmentId: firstInstallmentId,
            installment: { id: firstInstallmentId, installmentPlanId: planId },
            amount: new Decimal('200.00'),
            createdAt: new Date('2026-07-27T10:00:00.000Z'),
            voidedAt: new Date('2026-07-27T10:05:00.000Z'),
            voidedById: adminUser.userId,
            correctionId: null,
          },
          {
            id: 'allocation-new-1',
            paymentId,
            debtId: null,
            installmentId: firstInstallmentId,
            installment: { id: firstInstallmentId, installmentPlanId: planId },
            amount: new Decimal('120.00'),
            createdAt: new Date('2026-07-27T10:06:00.000Z'),
            voidedAt: null,
            voidedById: null,
            correctionId: null,
          },
          {
            id: 'allocation-new-2',
            paymentId,
            debtId: null,
            installmentId: secondInstallmentId,
            installment: { id: secondInstallmentId, installmentPlanId: planId },
            amount: new Decimal('80.00'),
            createdAt: new Date('2026-07-27T10:06:00.000Z'),
            voidedAt: null,
            voidedById: null,
            correctionId: null,
          },
        ],
      }));
    paymentsRepositoryMock.findInstallmentsByIds
      .mockResolvedValueOnce([firstTarget, secondTarget])
      .mockResolvedValueOnce([firstTarget, secondTarget]);
    installmentPlansRepositoryMock.findPlanById.mockResolvedValue(makePlanForStatusRefresh());
    installmentPlansRepositoryMock.updateInstallmentStatus.mockResolvedValue({});
    installmentPlansRepositoryMock.updatePlanStatus.mockResolvedValue({});

    const result = await PaymentsService.reallocatePayment(
      paymentId,
      {
        allocations: [
          { installmentId: firstInstallmentId, amount: '120.00' },
          { installmentId: secondInstallmentId, amount: '80.00' },
        ],
        reason: 'Payment was allocated to the wrong installments',
        sourceScreen: FinancialCorrectionSourceScreen.PLAN_DETAILS,
        accountPassword: 'admin-password',
      },
      adminUser
    );

    expect(verifyAdminPasswordMock).toHaveBeenCalledWith(adminUser.userId, 'admin-password', {
      action: 'REALLOCATE_PAYMENT',
      recordType: FinancialCorrectionRecordType.PAYMENT_ALLOCATION,
      recordId: paymentId,
    });
    expect(paymentsRepositoryMock.voidPayment).not.toHaveBeenCalled();
    expect(paymentsRepositoryMock.voidAllocationsForPayment).toHaveBeenCalledWith(
      tx,
      paymentId,
      expect.objectContaining({ voidedById: adminUser.userId })
    );
    expect(paymentsRepositoryMock.createInstallmentAllocations).toHaveBeenCalledWith(
      tx,
      [
        expect.objectContaining({ paymentId, installmentId: firstInstallmentId, amount: expect.any(Decimal) }),
        expect.objectContaining({ paymentId, installmentId: secondInstallmentId, amount: expect.any(Decimal) }),
      ]
    );
    expect(correctionAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recordType: FinancialCorrectionRecordType.PAYMENT_ALLOCATION,
        recordId: paymentId,
        action: FinancialCorrectionAction.REALLOCATE_PAYMENT,
        reason: 'Payment was allocated to the wrong installments',
      }),
      tx
    );
    expect(result.action).toBe(FinancialCorrectionAction.REALLOCATE_PAYMENT);
    expect(result.voidedAt).toBeNull();
  });
});
