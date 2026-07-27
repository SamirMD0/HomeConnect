import {
  DebtStatus,
  FinancialCorrectionAction,
  FinancialCorrectionRecordType,
  InstallmentPlanStatus,
  InstallmentStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { NotFoundError, ValidationError } from '../../../lib/errors';
import { verifyAdminPasswordForCorrection } from '../authorization/account-password';
import { writeFinancialCorrectionAudit } from '../corrections/correction-audit';
import {
  assertCanVoidPayment,
  assertPositiveMoney,
  businessDateToPrisma,
  calculateDebtBalance,
  calculateInstallmentBalance,
  determineDebtStatus,
  determineInstallmentPlanStatus,
  determineInstallmentStatus,
  isPaymentAllocationVoided,
  moneyToApiString,
  parseBusinessDate,
  planDebtPaymentAllocation,
  planInstallmentPaymentAllocations,
  prismaDateToBusinessDate,
  runFinancialTransaction,
  sumMoney,
  todayInBusinessTimezone,
} from '../index';
import { DebtsRepository } from '../debts/debts.repository';
import { InstallmentPlansRepository } from '../installment-plans/installment-plans.repository';
import { FinancialTransactionClient } from '../infrastructure/transaction';
import { CorrectPaymentInput, ReallocatePaymentInput, VoidPaymentInput } from './payments.validator';
import { PaymentsRepository, PaymentWithDetails } from './payments.repository';

interface AuthenticatedUser {
  userId: string;
  role: string;
}

interface PaymentCorrectionResult {
  paymentId: string;
  customerId: string;
  action: FinancialCorrectionAction;
  replacementPaymentId: string | null;
  voidedAt: string | null;
}

export class PaymentsService {
  static async voidPayment(
    paymentId: string,
    input: VoidPaymentInput,
    user: AuthenticatedUser
  ): Promise<PaymentCorrectionResult> {
    await verifyAdminPasswordForCorrection(user.userId, input.accountPassword, {
      action: 'VOID_PAYMENT',
      recordType: FinancialCorrectionRecordType.PAYMENT,
      recordId: paymentId,
    });

    const correctingUser = await PaymentsRepository.findUserIdentity(user.userId);
    if (!correctingUser) {
      throw new NotFoundError('Correcting user not found');
    }

    return runFinancialTransaction(async (tx) => {
      const payment = await PaymentsRepository.findPaymentById(paymentId, tx);
      if (!payment) {
        throw new NotFoundError('Payment not found');
      }

      assertCanVoidPayment({
        isVoided: Boolean(payment.voidedAt),
        reason: input.reason,
        voidedById: user.userId,
      });

      const beforeValues = this.toPaymentAuditValues(payment);
      const affected = this.getAffectedTargets(payment);
      const voidedAt = new Date();
      const voidedPayment = await PaymentsRepository.voidPayment(tx, paymentId, {
        voidedAt,
        voidedById: user.userId,
        voidReason: input.reason,
      });

      await PaymentsRepository.voidAllocationsForPayment(tx, paymentId, {
        voidedAt,
        voidedById: user.userId,
      });
      await this.recomputeAffectedStatuses(tx, affected, null);
      const refreshedVoidedPayment = await PaymentsRepository.findPaymentById(paymentId, tx);

      const audit = await writeFinancialCorrectionAudit(
        {
          recordType: FinancialCorrectionRecordType.PAYMENT,
          recordId: paymentId,
          customerId: payment.customerId,
          action: FinancialCorrectionAction.VOID_PAYMENT,
          correctedById: correctingUser.id,
          correctedByName: correctingUser.fullName,
          correctedByUsername: correctingUser.username,
          reason: input.reason,
          beforeValues,
          afterValues: this.toPaymentAuditValues(refreshedVoidedPayment ?? voidedPayment),
          affectedTotals: this.toAffectedTotals(affected),
          sourceScreen: input.sourceScreen,
        },
        tx
      );

      await PaymentsRepository.linkAllocationsToCorrection(tx, paymentId, audit.id);

      return {
        paymentId,
        customerId: payment.customerId,
        action: FinancialCorrectionAction.VOID_PAYMENT,
        replacementPaymentId: null,
        voidedAt: voidedAt.toISOString(),
      };
    });
  }

  static async correctPayment(
    paymentId: string,
    input: CorrectPaymentInput,
    user: AuthenticatedUser
  ): Promise<PaymentCorrectionResult> {
    await verifyAdminPasswordForCorrection(user.userId, input.accountPassword, {
      action: 'CORRECT_PAYMENT',
      recordType: FinancialCorrectionRecordType.PAYMENT,
      recordId: paymentId,
    });

    const correctingUser = await PaymentsRepository.findUserIdentity(user.userId);
    if (!correctingUser) {
      throw new NotFoundError('Correcting user not found');
    }

    const correctedAmount = input.amount ? assertPositiveMoney(input.amount) : null;
    const paymentDate = parseBusinessDate(input.paymentDate);

    return runFinancialTransaction(async (tx) => {
      const payment = await PaymentsRepository.findPaymentById(paymentId, tx);
      if (!payment) {
        throw new NotFoundError('Payment not found');
      }
      if (payment.voidedAt) {
        throw new ValidationError('Voided payments cannot be corrected');
      }

      if (correctedAmount && !correctedAmount.equals(payment.totalAmount)) {
        return this.reissuePayment(tx, payment, correctedAmount, input, correctingUser, user.userId);
      }

      const beforeValues = this.toPaymentAuditValues(payment);
      const updatedPayment = await PaymentsRepository.updatePaymentDetails(tx, paymentId, {
        paymentDate: businessDateToPrisma(paymentDate),
        paymentMethod: input.paymentMethod,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
      });
      const paymentDateChanged = prismaDateToBusinessDate(payment.paymentDate) !== paymentDate;

      await writeFinancialCorrectionAudit(
        {
          recordType: FinancialCorrectionRecordType.PAYMENT,
          recordId: paymentId,
          customerId: payment.customerId,
          action: paymentDateChanged
            ? FinancialCorrectionAction.CORRECT_DATE
            : FinancialCorrectionAction.CORRECT_DETAILS,
          correctedById: correctingUser.id,
          correctedByName: correctingUser.fullName,
          correctedByUsername: correctingUser.username,
          reason: input.reason,
          beforeValues,
          afterValues: this.toPaymentAuditValues(updatedPayment),
          sourceScreen: input.sourceScreen,
        },
        tx
      );

      return {
        paymentId,
        customerId: payment.customerId,
        action: paymentDateChanged
          ? FinancialCorrectionAction.CORRECT_DATE
          : FinancialCorrectionAction.CORRECT_DETAILS,
        replacementPaymentId: null,
        voidedAt: null,
      };
    });
  }

  static async reallocatePayment(
    paymentId: string,
    input: ReallocatePaymentInput,
    user: AuthenticatedUser
  ): Promise<PaymentCorrectionResult> {
    await verifyAdminPasswordForCorrection(user.userId, input.accountPassword, {
      action: 'REALLOCATE_PAYMENT',
      recordType: FinancialCorrectionRecordType.PAYMENT_ALLOCATION,
      recordId: paymentId,
    });

    const correctingUser = await PaymentsRepository.findUserIdentity(user.userId);
    if (!correctingUser) {
      throw new NotFoundError('Correcting user not found');
    }

    const requestedAllocations = input.allocations.map((allocation) => ({
      installmentId: allocation.installmentId,
      amount: assertPositiveMoney(allocation.amount),
    }));
    const requestedTotal = sumMoney(requestedAllocations.map((allocation) => allocation.amount));

    return runFinancialTransaction(async (tx) => {
      const payment = await PaymentsRepository.findPaymentById(paymentId, tx);
      if (!payment) {
        throw new NotFoundError('Payment not found');
      }
      if (payment.voidedAt) {
        throw new ValidationError('Voided payments cannot be reallocated');
      }
      if (!requestedTotal.equals(payment.totalAmount)) {
        throw new ValidationError('Replacement allocations must equal the payment total');
      }

      const affectedBefore = this.getAffectedTargets(payment);
      if (affectedBefore.debtIds.length > 0 || affectedBefore.planIds.length !== 1) {
        throw new ValidationError('Reallocation is only supported for one installment-plan payment');
      }
      const planId = affectedBefore.planIds[0];
      const targetInstallments = await PaymentsRepository.findInstallmentsByIds(
        tx,
        requestedAllocations.map((allocation) => allocation.installmentId)
      );
      this.assertValidReallocationTargets({
        payment,
        planId,
        requestedAllocations,
        targetInstallments,
      });

      const beforeValues = this.toPaymentAuditValues(payment);
      const voidedAt = new Date();
      await PaymentsRepository.voidAllocationsForPayment(tx, paymentId, {
        voidedAt,
        voidedById: user.userId,
      });

      const refreshedTargets = await PaymentsRepository.findInstallmentsByIds(
        tx,
        requestedAllocations.map((allocation) => allocation.installmentId)
      );
      this.assertNoInstallmentOverAllocation(requestedAllocations, refreshedTargets);

      await PaymentsRepository.createInstallmentAllocations(
        tx,
        requestedAllocations.map((allocation) => ({
          paymentId,
          installmentId: allocation.installmentId,
          amount: allocation.amount,
        }))
      );

      const affected = {
        debtIds: [],
        planIds: [planId],
      };
      await this.recomputeAffectedStatuses(tx, affected, prismaDateToBusinessDate(payment.paymentDate));

      const refreshedPayment = await PaymentsRepository.findPaymentById(paymentId, tx);
      if (!refreshedPayment) {
        throw new NotFoundError('Payment not found');
      }

      const audit = await writeFinancialCorrectionAudit(
        {
          recordType: FinancialCorrectionRecordType.PAYMENT_ALLOCATION,
          recordId: paymentId,
          customerId: payment.customerId,
          action: FinancialCorrectionAction.REALLOCATE_PAYMENT,
          correctedById: correctingUser.id,
          correctedByName: correctingUser.fullName,
          correctedByUsername: correctingUser.username,
          reason: input.reason,
          beforeValues,
          afterValues: this.toPaymentAuditValues(refreshedPayment),
          affectedTotals: this.toAffectedTotals(affected),
          sourceScreen: input.sourceScreen,
        },
        tx
      );

      await PaymentsRepository.linkAllocationsToCorrection(tx, paymentId, audit.id);

      return {
        paymentId,
        customerId: payment.customerId,
        action: FinancialCorrectionAction.REALLOCATE_PAYMENT,
        replacementPaymentId: null,
        voidedAt: null,
      };
    });
  }

  private static async reissuePayment(
    tx: FinancialTransactionClient,
    payment: PaymentWithDetails,
    correctedAmount: Decimal,
    input: CorrectPaymentInput,
    correctingUser: { id: string; fullName: string; username: string },
    correctedById: string
  ): Promise<PaymentCorrectionResult> {
    const affected = this.getAffectedTargets(payment);
    const paymentDate = parseBusinessDate(input.paymentDate);
    const beforeValues = this.toPaymentAuditValues(payment);
    const voidedAt = new Date();

    assertCanVoidPayment({
      isVoided: Boolean(payment.voidedAt),
      reason: input.reason,
      voidedById: correctedById,
    });

    await PaymentsRepository.voidPayment(tx, payment.id, {
      voidedAt,
      voidedById: correctedById,
      voidReason: input.reason,
    });
    await PaymentsRepository.voidAllocationsForPayment(tx, payment.id, {
      voidedAt,
      voidedById: correctedById,
    });
    await this.recomputeAffectedStatuses(tx, affected, null);

    const replacement = await PaymentsRepository.createReplacementPayment(tx, {
      customerId: payment.customerId,
      totalAmount: correctedAmount,
      paymentDate: businessDateToPrisma(paymentDate),
      paymentMethod: input.paymentMethod,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      createdById: correctedById,
    });

    if (affected.debtIds.length === 1 && affected.planIds.length === 0) {
      const debtId = affected.debtIds[0];
      const debt = await DebtsRepository.findDebtById(debtId, tx);
      if (!debt) {
        throw new NotFoundError('Debt not found for replacement payment');
      }
      const balance = calculateDebtBalance({
        originalAmount: debt.originalAmount,
        allocations: debt.paymentAllocations.map((allocation) => ({
          amount: allocation.amount,
          isVoided: isPaymentAllocationVoided(allocation),
        })),
      });
      const allocation = planDebtPaymentAllocation({
        debtId,
        paymentAmount: correctedAmount,
        remainingBalance: balance.remainingBalance,
        status: debt.status,
      });
      await PaymentsRepository.createDebtAllocation(tx, {
        paymentId: replacement.id,
        debtId,
        amount: allocation.amount,
      });
    } else if (affected.planIds.length === 1 && affected.debtIds.length === 0) {
      const planId = affected.planIds[0];
      const plan = await InstallmentPlansRepository.findPlanById(planId, tx);
      if (!plan) {
        throw new NotFoundError('Installment plan not found for replacement payment');
      }
      const allocations = planInstallmentPaymentAllocations({
        paymentAmount: correctedAmount,
        installments: plan.installments.map((installment) => {
          const balance = calculateInstallmentBalance({
            amountDue: installment.amountDue,
            allocations: installment.paymentAllocations.map((allocation) => ({
              amount: allocation.amount,
              isVoided: isPaymentAllocationVoided(allocation),
            })),
          });
          return {
            id: installment.id,
            dueDate: prismaDateToBusinessDate(installment.dueDate),
            installmentNumber: installment.installmentNumber,
            amountDue: installment.amountDue,
            amountPaid: balance.totalPaid,
            status: installment.status,
          };
        }),
      });
      await PaymentsRepository.createInstallmentAllocations(
        tx,
        allocations.map((allocation) => ({
          paymentId: replacement.id,
          installmentId: allocation.installmentId,
          amount: allocation.amount,
        }))
      );
    } else {
      throw new ValidationError('Amount correction is only supported for single debt or single installment-plan payments');
    }

    await this.recomputeAffectedStatuses(tx, affected, paymentDate);
    const replacementWithAllocations = await PaymentsRepository.findPaymentById(replacement.id, tx);
    if (!replacementWithAllocations) {
      throw new NotFoundError('Replacement payment not found');
    }

    const audit = await writeFinancialCorrectionAudit(
      {
        recordType: FinancialCorrectionRecordType.PAYMENT,
        recordId: payment.id,
        customerId: payment.customerId,
        action: FinancialCorrectionAction.REISSUE_PAYMENT,
        correctedById: correctingUser.id,
        correctedByName: correctingUser.fullName,
        correctedByUsername: correctingUser.username,
        reason: input.reason,
        beforeValues,
        afterValues: {
          ...this.toPaymentAuditValues(replacementWithAllocations),
          replacedPaymentId: payment.id,
        },
        affectedTotals: this.toAffectedTotals(affected),
        sourceScreen: input.sourceScreen,
      },
      tx
    );

    await PaymentsRepository.linkAllocationsToCorrection(tx, payment.id, audit.id);
    await PaymentsRepository.linkAllocationsToCorrection(tx, replacement.id, audit.id);

    return {
      paymentId: payment.id,
      customerId: payment.customerId,
      action: FinancialCorrectionAction.REISSUE_PAYMENT,
      replacementPaymentId: replacement.id,
      voidedAt: voidedAt.toISOString(),
    };
  }

  private static assertValidReallocationTargets(input: {
    payment: PaymentWithDetails;
    planId: string;
    requestedAllocations: Array<{ installmentId: string; amount: Decimal }>;
    targetInstallments: Awaited<ReturnType<typeof PaymentsRepository.findInstallmentsByIds>>;
  }) {
    if (input.targetInstallments.length !== input.requestedAllocations.length) {
      throw new ValidationError('One or more target installments were not found');
    }

    const requestedIds = new Set(input.requestedAllocations.map((allocation) => allocation.installmentId));
    for (const installment of input.targetInstallments) {
      if (!requestedIds.has(installment.id)) {
        throw new ValidationError('Unexpected target installment was loaded');
      }
      if (installment.installmentPlanId !== input.planId) {
        throw new ValidationError('All target installments must belong to the original installment plan');
      }
      if (installment.installmentPlan.customerId !== input.payment.customerId) {
        throw new ValidationError('Target installments must belong to the same customer as the payment');
      }
      if (
        installment.status === InstallmentStatus.CANCELLED ||
        installment.installmentPlan.status === InstallmentPlanStatus.CANCELLED ||
        installment.installmentPlan.cancelledAt
      ) {
        throw new ValidationError('Cancelled installments cannot receive reallocated payments');
      }
    }
  }

  private static assertNoInstallmentOverAllocation(
    requestedAllocations: Array<{ installmentId: string; amount: Decimal }>,
    targetInstallments: Awaited<ReturnType<typeof PaymentsRepository.findInstallmentsByIds>>
  ) {
    for (const requested of requestedAllocations) {
      const installment = targetInstallments.find((target) => target.id === requested.installmentId);
      if (!installment) {
        throw new ValidationError('One or more target installments were not found');
      }
      const balance = calculateInstallmentBalance({
        amountDue: installment.amountDue,
        allocations: installment.paymentAllocations.map((allocation) => ({
          amount: allocation.amount,
          isVoided: isPaymentAllocationVoided(allocation),
        })),
      });
      if (requested.amount.greaterThan(balance.remainingBalance)) {
        throw new ValidationError('Reallocated amount exceeds target installment remaining balance');
      }
    }
  }

  private static async recomputeAffectedStatuses(
    tx: FinancialTransactionClient,
    affected: { debtIds: string[]; planIds: string[] },
    paidDate: string | null
  ) {
    const businessDate = todayInBusinessTimezone();
    for (const debtId of affected.debtIds) {
      const debt = await DebtsRepository.findDebtById(debtId, tx);
      if (!debt) continue;
      const balance = calculateDebtBalance({
        originalAmount: debt.originalAmount,
        allocations: debt.paymentAllocations.map((allocation) => ({
          amount: allocation.amount,
          isVoided: isPaymentAllocationVoided(allocation),
        })),
      });
      const status = determineDebtStatus({
        isCancelled: debt.status === DebtStatus.CANCELLED || Boolean(debt.cancelledAt),
        dueDate: prismaDateToBusinessDate(debt.dueDate),
        businessDate,
        balance,
      });
      await DebtsRepository.updateDebtStatus(tx, debtId, status);
    }

    for (const planId of affected.planIds) {
      const plan = await InstallmentPlansRepository.findPlanById(planId, tx);
      if (!plan) continue;
      const isPlanCancelled = plan.status === InstallmentPlanStatus.CANCELLED || Boolean(plan.cancelledAt);
      const installmentStatuses: InstallmentStatus[] = [];

      for (const installment of plan.installments) {
        const balance = calculateInstallmentBalance({
          amountDue: installment.amountDue,
          allocations: installment.paymentAllocations.map((allocation) => ({
            amount: allocation.amount,
            isVoided: isPaymentAllocationVoided(allocation),
          })),
        });
        const status = determineInstallmentStatus({
          isCancelled: isPlanCancelled || installment.status === InstallmentStatus.CANCELLED,
          dueDate: prismaDateToBusinessDate(installment.dueDate),
          businessDate,
          balance,
        });
        installmentStatuses.push(status);
        await InstallmentPlansRepository.updateInstallmentStatus(tx, installment.id, {
          status,
          paidDate:
            status === InstallmentStatus.PAID
              ? installment.paidDate ?? (paidDate ? businessDateToPrisma(paidDate) : null)
              : null,
        });
      }

      const planStatus = determineInstallmentPlanStatus({
        isCancelled: isPlanCancelled,
        installments: installmentStatuses.map((status) => ({ status })),
      });
      await InstallmentPlansRepository.updatePlanStatus(tx, planId, planStatus);
    }
  }

  private static getAffectedTargets(payment: PaymentWithDetails) {
    const debtIds = Array.from(
      new Set(payment.allocations.map((allocation) => allocation.debtId).filter(Boolean))
    ) as string[];
    const planIds = Array.from(
      new Set(
        payment.allocations
          .map((allocation) => allocation.installment?.installmentPlanId ?? null)
          .filter(Boolean)
      )
    ) as string[];

    return { debtIds, planIds };
  }

  private static toAffectedTotals(affected: { debtIds: string[]; planIds: string[] }) {
    return {
      affectedDebtCount: affected.debtIds.length,
      affectedPlanCount: affected.planIds.length,
    };
  }

  private static toPaymentAuditValues(payment: PaymentWithDetails) {
    return {
      paymentId: payment.id,
      customerId: payment.customerId,
      totalAmount: moneyToApiString(payment.totalAmount),
      paymentDate: prismaDateToBusinessDate(payment.paymentDate),
      paymentMethod: payment.paymentMethod,
      reference: payment.reference,
      notes: payment.notes,
      idempotencyKey: payment.idempotencyKey,
      voidedAt: payment.voidedAt?.toISOString() ?? null,
      voidReason: payment.voidReason,
      allocations: payment.allocations.map((allocation) => ({
        id: allocation.id,
        debtId: allocation.debtId,
        installmentId: allocation.installmentId,
        installmentPlanId: allocation.installment?.installmentPlanId ?? null,
        amount: moneyToApiString(allocation.amount),
        voidedAt: allocation.voidedAt?.toISOString() ?? null,
      })),
    };
  }
}
