import {
  DebtStatus,
  FinancialCorrectionAction,
  FinancialCorrectionRecordType,
  PaymentMethod,
} from '@prisma/client';
import { NotFoundError, ValidationError } from '../../../lib/errors';
import {
  assertCanCancelDebt,
  assertIdempotentReplay,
  assertPositiveMoney,
  businessDateToPrisma,
  calculateDebtBalance,
  createIdempotencyFingerprint,
  determineDebtStatus,
  FinancialRecordAlreadyPaidError,
  FinancialRecordCancelledError,
  isPaymentAllocationVoided,
  moneyToApiString,
  normalizeIdempotencyKey,
  parseBusinessDate,
  planDebtPaymentAllocation,
  prismaDateToBusinessDate,
  runFinancialTransaction,
  todayInBusinessTimezone,
  ZERO_MONEY,
} from '../index';
import { DebtsRepository, DebtWithDetails } from './debts.repository';
import { verifyAccountPassword, verifyAdminPasswordForCorrection } from '../authorization/account-password';
import { writeFinancialCorrectionAudit } from '../corrections/correction-audit';
import {
  CancelDebtInput,
  CreateDebtInput,
  CreateDebtPaymentInput,
  ListCustomerDebtsQueryInput,
  UpdateDebtInput,
} from './debts.validator';

interface AuthenticatedUser {
  userId: string;
  role: string;
}

interface DebtListResult {
  debts: DebtView[];
  total: number;
  page: number;
  limit: number;
}

interface DebtView {
  id: string;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  description: string;
  originalAmount: string;
  totalPaid: string;
  remainingBalance: string;
  dueDate: string;
  status: DebtStatus;
  storedStatus: DebtStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string;
    username: string;
  };
  cancellation: {
    cancelledAt: string;
    reason: string | null;
    cancelledBy: {
      id: string;
      name: string;
      username: string;
    } | null;
  } | null;
  payments: DebtPaymentView[];
}

interface DebtPaymentView {
  id: string;
  totalAmount: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  reference: string | null;
  notes: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  createdBy: {
    id: string;
    name: string;
    username: string;
  };
  voidedAt: string | null;
  voidReason: string | null;
  voidedBy: {
    id: string;
    name: string;
    username: string;
  } | null;
  allocations: Array<{
    id: string;
    debtId: string | null;
    installmentId: string | null;
    amount: string;
    createdAt: string;
  }>;
}

export class DebtsService {
  static async createDebt(
    customerId: string,
    input: CreateDebtInput,
    user: AuthenticatedUser
  ): Promise<DebtView> {
    const customer = await DebtsRepository.findActiveCustomerById(customerId);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    const amount = assertPositiveMoney(input.amount);
    const dueDate = parseBusinessDate(input.dueDate);
    const initialBalance = calculateDebtBalance({ originalAmount: amount });
    const status = determineDebtStatus({
      isCancelled: false,
      dueDate,
      businessDate: todayInBusinessTimezone(),
      balance: initialBalance,
    });

    const debt = await DebtsRepository.createDebt({
      customerId,
      description: input.description,
      originalAmount: amount,
      dueDate: businessDateToPrisma(dueDate),
      status,
      notes: input.notes ?? null,
      createdById: user.userId,
    });

    return this.toDebtView(debt);
  }

  static async listCustomerDebts(
    customerId: string,
    query: ListCustomerDebtsQueryInput
  ): Promise<DebtListResult> {
    const customer = await DebtsRepository.findActiveCustomerById(customerId);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    const page = query.page;
    const limit = query.limit;
    const { debts, total } = await DebtsRepository.listDebtsByCustomer({
      customerId,
      skip: (page - 1) * limit,
      take: limit,
      status: query.status,
      includeCancelled: query.includeCancelled,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return {
      debts: debts.map((debt) => this.toDebtView(debt)),
      total,
      page,
      limit,
    };
  }

  static async getDebt(debtId: string): Promise<DebtView> {
    const debt = await DebtsRepository.findDebtById(debtId);
    if (!debt) {
      throw new NotFoundError('Debt not found');
    }
    return this.toDebtView(debt);
  }

  static async listDebtPayments(debtId: string): Promise<DebtPaymentView[]> {
    const debt = await DebtsRepository.findDebtById(debtId);
    if (!debt) {
      throw new NotFoundError('Debt not found');
    }
    return this.toPaymentHistory(debt);
  }

  static async updateDebt(
    debtId: string,
    input: UpdateDebtInput,
    user: AuthenticatedUser
  ): Promise<DebtView> {
    return this.correctDebt(debtId, input, user);
  }

  static async correctDebt(
    debtId: string,
    input: UpdateDebtInput,
    user: AuthenticatedUser
  ): Promise<DebtView> {
    await verifyAdminPasswordForCorrection(user.userId, input.accountPassword, {
      action: 'CORRECT_DEBT',
      recordType: FinancialCorrectionRecordType.DEBT,
      recordId: debtId,
    });

    const correctingUser = await DebtsRepository.findUserIdentity(user.userId);
    if (!correctingUser) {
      throw new NotFoundError('Correcting user not found');
    }

    const dueDate = parseBusinessDate(input.dueDate);
    const correctedAmount = input.originalAmount ? assertPositiveMoney(input.originalAmount) : null;

    return runFinancialTransaction(async (tx) => {
      const debt = await DebtsRepository.findDebtById(debtId, tx);
      if (!debt) {
        throw new NotFoundError('Debt not found');
      }

      const balance = this.calculateBalance(debt);
      const originalAmount = correctedAmount ?? debt.originalAmount;
      if (originalAmount.lessThan(balance.totalPaid)) {
        throw new ValidationError('Debt amount cannot be lower than the amount already paid');
      }
      const status = determineDebtStatus({
        isCancelled: debt.status === DebtStatus.CANCELLED || Boolean(debt.cancelledAt),
        dueDate: input.dueDate,
        businessDate: todayInBusinessTimezone(),
        balance: calculateDebtBalance({
          originalAmount,
          allocations: debt.paymentAllocations.map((allocation) => ({
            amount: allocation.amount,
            isVoided: isPaymentAllocationVoided(allocation),
          })),
        }),
      });
      const beforeValues = this.toDebtAuditValues(debt);

      const updatedDebt = await DebtsRepository.updateDebtDetails(tx, debtId, {
        originalAmount,
        description: input.description,
        dueDate: businessDateToPrisma(dueDate),
        notes: input.notes ?? null,
        status,
        ...(debt.cancelledAt ? { cancelReason: input.cancelReason ?? debt.cancelReason } : {}),
      });

      const updatedBalance = this.calculateBalance(updatedDebt);
      await writeFinancialCorrectionAudit(
        {
          recordType: FinancialCorrectionRecordType.DEBT,
          recordId: debtId,
          customerId: debt.customerId,
          action: originalAmount.equals(debt.originalAmount)
            ? FinancialCorrectionAction.CORRECT_DETAILS
            : FinancialCorrectionAction.CORRECT_AMOUNT,
          correctedById: correctingUser.id,
          correctedByName: correctingUser.fullName,
          correctedByUsername: correctingUser.username,
          reason: input.reason,
          beforeValues,
          afterValues: this.toDebtAuditValues(updatedDebt),
          affectedTotals: {
            obligationRemainingBefore: moneyToApiString(balance.remainingBalance),
            obligationRemainingAfter: moneyToApiString(updatedBalance.remainingBalance),
          },
          sourceScreen: input.sourceScreen,
        },
        tx
      );

      return this.toDebtView(updatedDebt);
    });
  }

  static async recordDebtPayment(
    debtId: string,
    input: CreateDebtPaymentInput,
    user: AuthenticatedUser
  ): Promise<DebtView> {
    const amount = assertPositiveMoney(input.amount);
    const paymentDate = parseBusinessDate(input.paymentDate);
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);

    return runFinancialTransaction(async (tx) => {
      const debt = await DebtsRepository.findDebtById(debtId, tx);
      if (!debt) {
        throw new NotFoundError('Debt not found');
      }

      if (idempotencyKey) {
        const existingPayment = await DebtsRepository.findPaymentByIdempotencyKey(tx, idempotencyKey);
        if (existingPayment) {
          const debtAllocation = existingPayment.allocations.find(
            (allocation) => allocation.debtId === debtId && allocation.installmentId === null
          );
          const existingFingerprint = createIdempotencyFingerprint({
            debtId: debtAllocation?.debtId ?? null,
            amount: moneyToApiString(existingPayment.totalAmount),
            paymentDate: prismaDateToBusinessDate(existingPayment.paymentDate),
            paymentMethod: existingPayment.paymentMethod,
            idempotencyKey: existingPayment.idempotencyKey,
            createdById: existingPayment.createdById,
          });
          const incomingFingerprint = createIdempotencyFingerprint({
            debtId,
            amount: moneyToApiString(amount),
            paymentDate,
            paymentMethod: input.paymentMethod,
            idempotencyKey,
            createdById: user.userId,
          });

          assertIdempotentReplay({ existingFingerprint, incomingFingerprint });
          const refreshedDebt = await DebtsRepository.findDebtById(debtId, tx);
          if (!refreshedDebt) {
            throw new NotFoundError('Debt not found');
          }
          return this.toDebtView(refreshedDebt);
        }
      }

      if (debt.status === DebtStatus.CANCELLED || debt.cancelledAt) {
        throw new FinancialRecordCancelledError('Cannot record payment against a cancelled debt');
      }

      const balance = this.calculateBalance(debt);
      if (balance.isFullyPaid) {
        throw new FinancialRecordAlreadyPaidError('Debt is already fully paid');
      }

      const allocationPlan = planDebtPaymentAllocation({
        debtId,
        paymentAmount: amount,
        remainingBalance: balance.remainingBalance,
        status: debt.status,
      });

      const payment = await DebtsRepository.createPayment(tx, {
        customerId: debt.customerId,
        totalAmount: amount,
        paymentDate: businessDateToPrisma(paymentDate),
        paymentMethod: input.paymentMethod,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        idempotencyKey,
        createdById: user.userId,
      });

      await DebtsRepository.createDebtPaymentAllocation(tx, {
        paymentId: payment.id,
        debtId,
        amount: allocationPlan.amount,
      });

      const refreshedDebt = await DebtsRepository.findDebtById(debtId, tx);
      if (!refreshedDebt) {
        throw new NotFoundError('Debt not found');
      }

      const refreshedBalance = this.calculateBalance(refreshedDebt);
      const status = determineDebtStatus({
        isCancelled: false,
        dueDate: prismaDateToBusinessDate(refreshedDebt.dueDate),
        businessDate: todayInBusinessTimezone(),
        balance: refreshedBalance,
      });

      const updatedDebt = await DebtsRepository.updateDebtStatus(tx, debtId, status);
      return this.toDebtView(updatedDebt);
    });
  }

  static async cancelDebt(
    debtId: string,
    input: CancelDebtInput,
    user: AuthenticatedUser
  ): Promise<DebtView> {
    await verifyAccountPassword(user.userId, input.accountPassword);

    return runFinancialTransaction(async (tx) => {
      const debt = await DebtsRepository.findDebtById(debtId, tx);
      if (!debt) {
        throw new NotFoundError('Debt not found');
      }

      const balance = this.calculateBalance(debt);

      assertCanCancelDebt({
        status: debt.status,
        hasPayments: balance.totalPaid.greaterThan(ZERO_MONEY),
        reason: input.reason,
        cancelledById: user.userId,
      });

      const cancelledDebt = await DebtsRepository.cancelDebt(tx, debtId, {
        cancelledAt: new Date(),
        cancelledById: user.userId,
        cancelReason: input.reason,
      });

      return this.toDebtView(cancelledDebt);
    });
  }

  private static toDebtView(debt: DebtWithDetails): DebtView {
    const balance = this.calculateBalance(debt);
    const dueDate = prismaDateToBusinessDate(debt.dueDate);
    const status = determineDebtStatus({
      isCancelled: debt.status === DebtStatus.CANCELLED || Boolean(debt.cancelledAt),
      dueDate,
      businessDate: todayInBusinessTimezone(),
      balance,
    });

    return {
      id: debt.id,
      customer: debt.customer,
      description: debt.description,
      originalAmount: moneyToApiString(debt.originalAmount),
      totalPaid: moneyToApiString(balance.totalPaid),
      remainingBalance: moneyToApiString(balance.remainingBalance),
      dueDate,
      status,
      storedStatus: debt.status,
      notes: debt.notes,
      createdAt: debt.createdAt.toISOString(),
      updatedAt: debt.updatedAt.toISOString(),
      createdBy: {
        id: debt.createdBy.id,
        name: debt.createdBy.fullName,
        username: debt.createdBy.username,
      },
      cancellation: debt.cancelledAt
        ? {
            cancelledAt: debt.cancelledAt.toISOString(),
            reason: debt.cancelReason,
            cancelledBy: debt.cancelledBy
              ? {
                  id: debt.cancelledBy.id,
                  name: debt.cancelledBy.fullName,
                  username: debt.cancelledBy.username,
                }
              : null,
          }
        : null,
      payments: this.toPaymentHistory(debt),
    };
  }

  private static toPaymentHistory(debt: DebtWithDetails): DebtPaymentView[] {
    const paymentsById = new Map<string, DebtPaymentView>();

    for (const allocation of debt.paymentAllocations) {
      const payment = allocation.payment;
      if (!paymentsById.has(payment.id)) {
        paymentsById.set(payment.id, {
          id: payment.id,
          totalAmount: moneyToApiString(payment.totalAmount),
          paymentDate: prismaDateToBusinessDate(payment.paymentDate),
          paymentMethod: payment.paymentMethod,
          reference: payment.reference,
          notes: payment.notes,
          idempotencyKey: payment.idempotencyKey,
          createdAt: payment.createdAt.toISOString(),
          createdBy: {
            id: payment.createdBy.id,
            name: payment.createdBy.fullName,
            username: payment.createdBy.username,
          },
          voidedAt: payment.voidedAt?.toISOString() ?? null,
          voidReason: payment.voidReason,
          voidedBy: payment.voidedBy
            ? {
                id: payment.voidedBy.id,
                name: payment.voidedBy.fullName,
                username: payment.voidedBy.username,
              }
            : null,
          allocations: payment.allocations.map((paymentAllocation) => ({
            id: paymentAllocation.id,
            debtId: paymentAllocation.debtId,
            installmentId: paymentAllocation.installmentId,
            amount: moneyToApiString(paymentAllocation.amount),
            createdAt: paymentAllocation.createdAt.toISOString(),
          })),
        });
      }
    }

    return Array.from(paymentsById.values()).sort((left, right) =>
      left.paymentDate === right.paymentDate
        ? left.createdAt.localeCompare(right.createdAt)
        : left.paymentDate.localeCompare(right.paymentDate)
    );
  }

  private static calculateBalance(debt: DebtWithDetails) {
    return calculateDebtBalance({
      originalAmount: debt.originalAmount,
      allocations: debt.paymentAllocations.map((allocation) => ({
        amount: allocation.amount,
        isVoided: isPaymentAllocationVoided(allocation),
      })),
    });
  }

  private static toDebtAuditValues(debt: DebtWithDetails) {
    return {
      description: debt.description,
      originalAmount: moneyToApiString(debt.originalAmount),
      dueDate: prismaDateToBusinessDate(debt.dueDate),
      notes: debt.notes,
      status: debt.status,
      cancelReason: debt.cancelReason,
    };
  }

  static assertNoUnknownFinancialFieldsForTests(input: Record<string, unknown>) {
    const forbiddenFields = ['status', 'createdById', 'createdBy', 'totalPaid', 'remainingBalance'];
    const found = forbiddenFields.filter((field) => field in input);
    if (found.length > 0) {
      throw new ValidationError(`Forbidden financial fields: ${found.join(', ')}`);
    }
  }
}
