import {
  FinancialCorrectionAction,
  FinancialCorrectionRecordType,
  InstallmentPlanFrequency,
  InstallmentPlanStatus,
  InstallmentStatus,
  PaymentMethod,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { NotFoundError, ValidationError } from '../../../lib/errors';
import {
  assertCanCancelInstallmentPlan,
  assertIdempotentReplay,
  assertPositiveMoney,
  addMonthsToBusinessDate,
  businessDateToPrisma,
  calculateInstallmentBalance,
  calculateInstallmentPlanSummary,
  centsToMoney,
  createIdempotencyFingerprint,
  determineInstallmentPlanStatus,
  determineInstallmentStatus,
  FinancialInvariantError,
  FinancialRecordAlreadyPaidError,
  FinancialRecordCancelledError,
  generateMonthlyInstallmentSchedule,
  isPaymentAllocationVoided,
  moneyToApiString,
  moneyToCents,
  normalizeIdempotencyKey,
  parseBusinessDate,
  planInstallmentPaymentAllocations,
  prismaDateToBusinessDate,
  runFinancialTransaction,
  sumMoney,
  todayInBusinessTimezone,
} from '../index';
import {
  CancelInstallmentPlanInput,
  CreateInstallmentPlanInput,
  CreateInstallmentPlanPaymentInput,
  ListCustomerInstallmentPlansQueryInput,
  UpdateInstallmentPlanInput,
} from './installment-plans.validator';
import {
  InstallmentPlanWithDetails,
  InstallmentPlansRepository,
} from './installment-plans.repository';
import { verifyAccountPassword, verifyAdminPasswordForCorrection } from '../authorization/account-password';
import { writeFinancialCorrectionAudit } from '../corrections/correction-audit';

interface AuthenticatedUser {
  userId: string;
  role: string;
}

interface InstallmentPlanListResult {
  plans: InstallmentPlanView[];
  total: number;
  page: number;
  limit: number;
}

interface InstallmentPlanView {
  id: string;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  description: string;
  totalAmount: string;
  totalPaid: string;
  remainingBalance: string;
  startDate: string;
  installmentCount: number;
  frequency: InstallmentPlanFrequency;
  status: InstallmentPlanStatus;
  storedStatus: InstallmentPlanStatus;
  nextDueDate: string | null;
  completedInstallmentCount: number;
  overdueInstallmentCount: number;
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
  schedule: InstallmentView[];
  payments: InstallmentPlanPaymentView[];
}

interface InstallmentView {
  id: string;
  installmentNumber: number;
  dueDate: string;
  amountDue: string;
  totalPaid: string;
  remainingAmount: string;
  status: InstallmentStatus;
  storedStatus: InstallmentStatus;
  paidDate: string | null;
}

interface InstallmentPlanPaymentView {
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

export class InstallmentPlansService {
  static async createPlan(
    customerId: string,
    input: CreateInstallmentPlanInput,
    user: AuthenticatedUser
  ): Promise<InstallmentPlanView> {
    const totalAmount = assertPositiveMoney(input.totalAmount);
    const startDate = parseBusinessDate(input.startDate);
    const schedule = input.schedule
      ? this.createManualMonthlySchedule(input, totalAmount, startDate)
      : generateMonthlyInstallmentSchedule({
          totalAmount,
          startDate,
          installmentCount: input.installmentCount,
          frequency: input.frequency,
        });

    const generatedTotal = sumMoney(schedule.map((installment) => installment.amountDue));
    if (!generatedTotal.equals(totalAmount)) {
      throw new FinancialInvariantError('Generated schedule total does not match plan total');
    }

    return runFinancialTransaction(async (tx) => {
      const customer = await InstallmentPlansRepository.findActiveCustomerById(customerId, tx);
      if (!customer) {
        throw new NotFoundError('Customer not found');
      }

      const businessDate = todayInBusinessTimezone();
      const installmentStatuses = schedule.map((installment) =>
        determineInstallmentStatus({
          isCancelled: false,
          dueDate: installment.dueDate,
          businessDate,
          balance: calculateInstallmentBalance({ amountDue: installment.amountDue }),
        })
      );
      const planStatus = determineInstallmentPlanStatus({
        isCancelled: false,
        installments: installmentStatuses.map((status) => ({ status })),
      });

      const plan = await InstallmentPlansRepository.createPlanWithInstallments(
        tx,
        {
          customerId,
          description: input.description,
          totalAmount,
          startDate: businessDateToPrisma(startDate),
          installmentCount: input.installmentCount,
          frequency: input.frequency,
          status: planStatus,
          notes: input.notes ?? null,
          createdById: user.userId,
        },
        schedule.map((installment, index) => ({
          installmentNumber: installment.installmentNumber,
          dueDate: businessDateToPrisma(installment.dueDate),
          amountDue: installment.amountDue,
          status: installmentStatuses[index],
        }))
      );

      return this.toPlanView(plan);
    });
  }

  static async listCustomerPlans(
    customerId: string,
    query: ListCustomerInstallmentPlansQueryInput
  ): Promise<InstallmentPlanListResult> {
    const customer = await InstallmentPlansRepository.findActiveCustomerById(customerId);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    const { plans, total } = await InstallmentPlansRepository.listPlansByCustomer({
      customerId,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      status: query.status,
      includeCancelled: query.includeCancelled,
      sortOrder: query.sortOrder,
    });

    return {
      plans: plans.map((plan) => this.toPlanView(plan)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  static async getPlan(planId: string): Promise<InstallmentPlanView> {
    const plan = await InstallmentPlansRepository.findPlanById(planId);
    if (!plan) {
      throw new NotFoundError('Installment plan not found');
    }
    return this.toPlanView(plan);
  }

  static async listPlanPayments(planId: string): Promise<InstallmentPlanPaymentView[]> {
    const plan = await InstallmentPlansRepository.findPlanById(planId);
    if (!plan) {
      throw new NotFoundError('Installment plan not found');
    }
    return this.toPaymentHistory(plan);
  }

  static async updatePlan(
    planId: string,
    input: UpdateInstallmentPlanInput,
    user: AuthenticatedUser
  ): Promise<InstallmentPlanView> {
    return this.correctPlan(planId, input, user);
  }

  static async correctPlan(
    planId: string,
    input: UpdateInstallmentPlanInput,
    user: AuthenticatedUser
  ): Promise<InstallmentPlanView> {
    await verifyAdminPasswordForCorrection(user.userId, input.accountPassword, {
      action: 'CORRECT_INSTALLMENT_PLAN',
      recordType: FinancialCorrectionRecordType.INSTALLMENT_PLAN,
      recordId: planId,
    });

    return runFinancialTransaction(async (tx) => {
      const plan = await InstallmentPlansRepository.findPlanById(planId, tx);
      if (!plan) {
        throw new NotFoundError('Installment plan not found');
      }

      const correctingUser = await tx.user.findUnique({
        where: { id: user.userId },
        select: {
          id: true,
          fullName: true,
          username: true,
        },
      });
      if (!correctingUser) {
        throw new NotFoundError('Correcting user not found');
      }

      const correctedTotal = input.totalAmount ? assertPositiveMoney(input.totalAmount) : plan.totalAmount;
      const correctedStartDate = input.startDate
        ? parseBusinessDate(input.startDate)
        : prismaDateToBusinessDate(plan.startDate);
      const correctedInstallmentCount = input.installmentCount ?? plan.installmentCount;
      const scheduleAffectingChange =
        !correctedTotal.equals(plan.totalAmount) ||
        correctedStartDate !== prismaDateToBusinessDate(plan.startDate) ||
        correctedInstallmentCount !== plan.installmentCount ||
        Boolean(input.schedule);

      if (correctedInstallmentCount !== plan.installmentCount) {
        throw new ValidationError('Changing installment count requires a dedicated replacement-plan workflow');
      }
      const planHasPayments = this.hasNonVoidedAllocations(plan);

      const beforeValues = this.toPlanAuditValues(plan);
      const schedule = scheduleAffectingChange
        ? this.createCorrectedSchedule({
            totalAmount: correctedTotal,
            startDate: correctedStartDate,
            installmentCount: correctedInstallmentCount,
            frequency: plan.frequency,
            schedule: input.schedule,
            existingPlan: planHasPayments ? plan : undefined,
          })
        : null;
      if (schedule && planHasPayments) {
        this.assertCorrectedScheduleSupportsExistingPayments(plan, schedule);
      }

      const businessDate = todayInBusinessTimezone();
      const installmentStatuses =
        schedule?.map((installment, index) =>
          determineInstallmentStatus({
            isCancelled: false,
            dueDate: installment.dueDate,
            businessDate,
            balance: calculateInstallmentBalance({
              amountDue: installment.amountDue,
              allocations: plan.installments[index].paymentAllocations.map((allocation) => ({
                amount: allocation.amount,
                isVoided: isPaymentAllocationVoided(allocation),
              })),
            }),
          })
        ) ?? plan.installments.map((installment) => installment.status);
      const planStatus = determineInstallmentPlanStatus({
        isCancelled: plan.status === InstallmentPlanStatus.CANCELLED || Boolean(plan.cancelledAt),
        installments: installmentStatuses.map((status) => ({ status })),
      });

      const updatedPlan = await InstallmentPlansRepository.updatePlanDetails(tx, planId, {
        description: input.description,
        totalAmount: correctedTotal,
        startDate: businessDateToPrisma(correctedStartDate),
        installmentCount: correctedInstallmentCount,
        status: planStatus,
        notes: input.notes ?? null,
        ...(plan.cancelledAt ? { cancelReason: input.cancelReason ?? plan.cancelReason } : {}),
      });

      if (schedule) {
        await InstallmentPlansRepository.updateInstallmentScheduleRows(
          tx,
          plan.installments.map((installment, index) => ({
            id: installment.id,
            dueDate: businessDateToPrisma(schedule[index].dueDate),
            amountDue: schedule[index].amountDue,
            status: installmentStatuses[index],
            paidDate:
              installmentStatuses[index] === InstallmentStatus.PAID
                ? installment.paidDate ?? businessDateToPrisma(businessDate)
                : null,
          }))
        );
      }

      const refreshedPlan = await InstallmentPlansRepository.findPlanById(planId, tx);
      if (!refreshedPlan) {
        throw new NotFoundError('Installment plan not found');
      }

      await writeFinancialCorrectionAudit(
        {
          recordType: FinancialCorrectionRecordType.INSTALLMENT_PLAN,
          recordId: planId,
          customerId: plan.customerId,
          action: this.getPlanCorrectionAction({ before: plan, after: refreshedPlan, scheduleChanged: Boolean(schedule) }),
          correctedById: correctingUser.id,
          correctedByName: correctingUser.fullName,
          correctedByUsername: correctingUser.username,
          reason: input.reason,
          beforeValues,
          afterValues: this.toPlanAuditValues(refreshedPlan),
          affectedTotals: {
            remainingBefore: moneyToApiString(this.calculatePlanSummary(plan).remainingBalance),
            remainingAfter: moneyToApiString(this.calculatePlanSummary(refreshedPlan).remainingBalance),
          },
          sourceScreen: input.sourceScreen,
        },
        tx
      );

      return this.toPlanView(schedule ? refreshedPlan : updatedPlan);
    });
  }

  static async recordPlanPayment(
    planId: string,
    input: CreateInstallmentPlanPaymentInput,
    user: AuthenticatedUser
  ): Promise<InstallmentPlanView> {
    const amount = assertPositiveMoney(input.amount);
    const paymentDate = parseBusinessDate(input.paymentDate);
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);

    return runFinancialTransaction(async (tx) => {
      const plan = await InstallmentPlansRepository.findPlanById(planId, tx);
      if (!plan) {
        throw new NotFoundError('Installment plan not found');
      }

      if (idempotencyKey) {
        const existingPayment = await InstallmentPlansRepository.findPaymentByIdempotencyKey(tx, idempotencyKey);
        if (existingPayment) {
          const planInstallmentIds = new Set(plan.installments.map((installment) => installment.id));
          const belongsToPlan = existingPayment.allocations.every(
            (allocation) =>
              allocation.debtId === null &&
              allocation.installmentId !== null &&
              planInstallmentIds.has(allocation.installmentId)
          );
          const existingFingerprint = createIdempotencyFingerprint({
            planId: belongsToPlan ? planId : null,
            amount: moneyToApiString(existingPayment.totalAmount),
            paymentDate: prismaDateToBusinessDate(existingPayment.paymentDate),
            paymentMethod: existingPayment.paymentMethod,
            idempotencyKey: existingPayment.idempotencyKey,
            createdById: existingPayment.createdById,
          });
          const incomingFingerprint = createIdempotencyFingerprint({
            planId,
            amount: moneyToApiString(amount),
            paymentDate,
            paymentMethod: input.paymentMethod,
            idempotencyKey,
            createdById: user.userId,
          });

          assertIdempotentReplay({ existingFingerprint, incomingFingerprint });
          const refreshedPlan = await InstallmentPlansRepository.findPlanById(planId, tx);
          if (!refreshedPlan) {
            throw new NotFoundError('Installment plan not found');
          }
          return this.toPlanView(refreshedPlan);
        }
      }

      if (plan.status === InstallmentPlanStatus.CANCELLED || plan.cancelledAt) {
        throw new FinancialRecordCancelledError('Cannot record payment against a cancelled installment plan');
      }

      const calculatedStatus = this.calculatePlanStatus(plan);
      if (calculatedStatus === InstallmentPlanStatus.COMPLETED) {
        throw new FinancialRecordAlreadyPaidError('Installment plan is already completed');
      }

      const allocationPlan = planInstallmentPaymentAllocations({
        paymentAmount: amount,
        installments: plan.installments.map((installment) => {
          const balance = this.calculateInstallmentBalanceForPlan(installment);
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

      const payment = await InstallmentPlansRepository.createPayment(tx, {
        customerId: plan.customerId,
        totalAmount: amount,
        paymentDate: businessDateToPrisma(paymentDate),
        paymentMethod: input.paymentMethod,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        idempotencyKey,
        createdById: user.userId,
      });

      await InstallmentPlansRepository.createPaymentAllocations(
        tx,
        allocationPlan.map((allocation) => ({
          paymentId: payment.id,
          installmentId: allocation.installmentId,
          amount: allocation.amount,
        }))
      );

      const refreshedPlan = await InstallmentPlansRepository.findPlanById(planId, tx);
      if (!refreshedPlan) {
        throw new NotFoundError('Installment plan not found');
      }

      const businessDate = todayInBusinessTimezone();
      for (const installment of refreshedPlan.installments) {
        if (installment.status === InstallmentStatus.CANCELLED) continue;

        const balance = this.calculateInstallmentBalanceForPlan(installment);
        const status = determineInstallmentStatus({
          isCancelled: false,
          dueDate: prismaDateToBusinessDate(installment.dueDate),
          businessDate,
          balance,
        });

        await InstallmentPlansRepository.updateInstallmentStatus(tx, installment.id, {
          status,
          paidDate:
            status === InstallmentStatus.PAID
              ? installment.paidDate ?? businessDateToPrisma(paymentDate)
              : null,
        });
      }

      const statusRefreshedPlan = await InstallmentPlansRepository.findPlanById(planId, tx);
      if (!statusRefreshedPlan) {
        throw new NotFoundError('Installment plan not found');
      }
      const planStatus = this.calculatePlanStatus(statusRefreshedPlan);
      const updatedPlan = await InstallmentPlansRepository.updatePlanStatus(tx, planId, planStatus);
      return this.toPlanView(updatedPlan);
    });
  }

  static async cancelPlan(
    planId: string,
    input: CancelInstallmentPlanInput,
    user: AuthenticatedUser
  ): Promise<InstallmentPlanView> {
    await verifyAccountPassword(user.userId, input.accountPassword);

    return runFinancialTransaction(async (tx) => {
      const plan = await InstallmentPlansRepository.findPlanById(planId, tx);
      if (!plan) {
        throw new NotFoundError('Installment plan not found');
      }

      const summary = this.calculatePlanSummary(plan);

      assertCanCancelInstallmentPlan({
        status: plan.status,
        hasPayments: summary.totalPaid.greaterThan(new Decimal('0.00')),
        reason: input.reason,
        cancelledById: user.userId,
      });

      const cancelledPlan = await InstallmentPlansRepository.cancelPlan(tx, planId, {
        cancelledAt: new Date(),
        cancelledById: user.userId,
        cancelReason: input.reason,
      });

      if (!cancelledPlan) {
        throw new NotFoundError('Installment plan not found');
      }

      return this.toPlanView(cancelledPlan);
    });
  }

  private static createManualMonthlySchedule(
    input: CreateInstallmentPlanInput,
    totalAmount: Decimal,
    startDate: string
  ) {
    if (!input.schedule || input.schedule.length !== input.installmentCount) {
      throw new FinancialInvariantError('Manual schedule must have one amount for each installment');
    }

    const amounts = input.schedule.map((installment) => assertPositiveMoney(installment.amountDue));
    const manualTotal = sumMoney(amounts);
    if (!manualTotal.equals(totalAmount)) {
      throw new FinancialInvariantError('Manual installment schedule total must match plan total');
    }

    return amounts.map((amountDue, index) => ({
      installmentNumber: index + 1,
      dueDate: addMonthsToBusinessDate(startDate, index),
      amountDue,
    }));
  }

  private static createCorrectedSchedule(input: {
    totalAmount: Decimal;
    startDate: string;
    installmentCount: number;
    frequency: InstallmentPlanFrequency;
    schedule?: Array<{ amountDue: string }>;
    existingPlan?: InstallmentPlanWithDetails;
  }) {
    if (!input.schedule && input.existingPlan) {
      return this.createPaymentAwareCorrectedSchedule({
        ...input,
        existingPlan: input.existingPlan,
      });
    }

    if (!input.schedule) {
      return generateMonthlyInstallmentSchedule({
        totalAmount: input.totalAmount,
        startDate: input.startDate,
        installmentCount: input.installmentCount,
        frequency: input.frequency,
      });
    }

    if (input.schedule.length !== input.installmentCount) {
      throw new FinancialInvariantError('Manual schedule must have one amount for each installment');
    }

    const amounts = input.schedule.map((installment) => assertPositiveMoney(installment.amountDue));
    const manualTotal = sumMoney(amounts);
    if (!manualTotal.equals(input.totalAmount)) {
      throw new FinancialInvariantError('Manual installment schedule total must match plan total');
    }

    return amounts.map((amountDue, index) => ({
      installmentNumber: index + 1,
      dueDate: addMonthsToBusinessDate(input.startDate, index),
      amountDue,
    }));
  }

  private static createPaymentAwareCorrectedSchedule(input: {
    totalAmount: Decimal;
    startDate: string;
    installmentCount: number;
    frequency: InstallmentPlanFrequency;
    existingPlan: InstallmentPlanWithDetails;
  }) {
    if (input.frequency !== InstallmentPlanFrequency.MONTHLY) {
      throw new FinancialInvariantError('Only monthly installment schedules are supported');
    }

    const fixedAmounts = input.existingPlan.installments.map((installment) => {
      const paidAmount = this.installmentNonVoidedPaymentTotal(installment);
      return paidAmount.greaterThan(new Decimal('0.00')) ? installment.amountDue : new Decimal('0.00');
    });
    const adjustableIndexes = fixedAmounts
      .map((amount, index) => (amount.equals(new Decimal('0.00')) ? index : null))
      .filter((index): index is number => index !== null);

    if (adjustableIndexes.length === 0) {
      return generateMonthlyInstallmentSchedule({
        totalAmount: input.totalAmount,
        startDate: input.startDate,
        installmentCount: input.installmentCount,
        frequency: input.frequency,
      });
    }

    const fixedTotalCents = fixedAmounts.reduce(
      (total, amount) => total + moneyToCents(amount),
      0n
    );
    const totalCents = moneyToCents(input.totalAmount);
    const minimumAdjustableCents = BigInt(adjustableIndexes.length);
    if (totalCents < fixedTotalCents + minimumAdjustableCents) {
      throw new ValidationError(
        'Total amount is too low for the installments that already have payments'
      );
    }

    const distributedAmounts = this.distributeCentsAcrossInstallments(
      totalCents - fixedTotalCents,
      adjustableIndexes.length
    );
    const amounts = [...fixedAmounts];
    adjustableIndexes.forEach((installmentIndex, distributedIndex) => {
      amounts[installmentIndex] = distributedAmounts[distributedIndex];
    });

    return amounts.map((amountDue, index) => ({
      installmentNumber: index + 1,
      dueDate: addMonthsToBusinessDate(input.startDate, index),
      amountDue,
    }));
  }

  private static distributeCentsAcrossInstallments(totalCents: bigint, installmentCount: number): Decimal[] {
    const count = BigInt(installmentCount);
    const useWholeDollarSplit = totalCents % 100n === 0n && totalCents / 100n >= count;
    const baseCents = useWholeDollarSplit ? (totalCents / 100n / count) * 100n : totalCents / count;
    const remainderCents = useWholeDollarSplit ? (totalCents / 100n) % count : 0n;
    const amounts: Decimal[] = [];
    let allocatedCents = 0n;

    for (let index = 0; index < installmentCount; index += 1) {
      const amountCents = useWholeDollarSplit
        ? baseCents + (BigInt(index) < remainderCents ? 100n : 0n)
        : index === installmentCount - 1
          ? totalCents - allocatedCents
          : baseCents;

      if (amountCents <= 0n) {
        throw new ValidationError('Installment amount must be greater than zero');
      }

      amounts.push(centsToMoney(amountCents));
      allocatedCents += amountCents;
    }

    return amounts;
  }

  private static assertCorrectedScheduleSupportsExistingPayments(
    plan: InstallmentPlanWithDetails,
    schedule: Array<{ amountDue: Decimal }>
  ) {
    for (const [index, installment] of plan.installments.entries()) {
      const paidAmount = this.installmentNonVoidedPaymentTotal(installment);
      if (schedule[index].amountDue.lessThan(paidAmount)) {
        throw new ValidationError(
          `Installment ${installment.installmentNumber} cannot be less than its existing paid amount`
        );
      }
    }
  }

  private static installmentNonVoidedPaymentTotal(
    installment: InstallmentPlanWithDetails['installments'][number]
  ): Decimal {
    return sumMoney(
      installment.paymentAllocations
        .filter((allocation) => !isPaymentAllocationVoided(allocation))
        .map((allocation) => allocation.amount)
    );
  }

  private static hasNonVoidedAllocations(plan: InstallmentPlanWithDetails): boolean {
    return this.calculatePlanSummary(plan).totalPaid.greaterThan(new Decimal('0.00'));
  }

  private static getPlanCorrectionAction(input: {
    before: InstallmentPlanWithDetails;
    after: InstallmentPlanWithDetails;
    scheduleChanged: boolean;
  }): FinancialCorrectionAction {
    if (!input.before.totalAmount.equals(input.after.totalAmount) || input.scheduleChanged) {
      return FinancialCorrectionAction.CORRECT_AMOUNT;
    }
    if (prismaDateToBusinessDate(input.before.startDate) !== prismaDateToBusinessDate(input.after.startDate)) {
      return FinancialCorrectionAction.CORRECT_DATE;
    }
    return FinancialCorrectionAction.CORRECT_DETAILS;
  }

  private static toPlanAuditValues(plan: InstallmentPlanWithDetails) {
    return {
      description: plan.description,
      totalAmount: moneyToApiString(plan.totalAmount),
      startDate: prismaDateToBusinessDate(plan.startDate),
      installmentCount: plan.installmentCount,
      frequency: plan.frequency,
      notes: plan.notes,
      status: plan.status,
      cancelReason: plan.cancelReason,
      schedule: plan.installments.map((installment) => ({
        id: installment.id,
        installmentNumber: installment.installmentNumber,
        dueDate: prismaDateToBusinessDate(installment.dueDate),
        amountDue: moneyToApiString(installment.amountDue),
        status: installment.status,
        paidDate: installment.paidDate ? prismaDateToBusinessDate(installment.paidDate) : null,
      })),
    };
  }

  private static toPlanView(plan: InstallmentPlanWithDetails): InstallmentPlanView {
    const summary = this.calculatePlanSummary(plan);
    const status = this.calculatePlanStatus(plan);

    return {
      id: plan.id,
      customer: plan.customer,
      description: plan.description,
      totalAmount: moneyToApiString(plan.totalAmount),
      totalPaid: moneyToApiString(summary.totalPaid),
      remainingBalance: moneyToApiString(summary.remainingBalance),
      startDate: prismaDateToBusinessDate(plan.startDate),
      installmentCount: plan.installmentCount,
      frequency: plan.frequency,
      status,
      storedStatus: plan.status,
      nextDueDate: summary.nextDueDate,
      completedInstallmentCount: summary.completedInstallmentCount,
      overdueInstallmentCount: summary.overdueInstallmentCount,
      notes: plan.notes,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
      createdBy: {
        id: plan.createdBy.id,
        name: plan.createdBy.fullName,
        username: plan.createdBy.username,
      },
      cancellation: plan.cancelledAt
        ? {
            cancelledAt: plan.cancelledAt.toISOString(),
            reason: plan.cancelReason,
            cancelledBy: plan.cancelledBy
              ? {
                  id: plan.cancelledBy.id,
                  name: plan.cancelledBy.fullName,
                  username: plan.cancelledBy.username,
                }
              : null,
          }
        : null,
      schedule: plan.installments.map((installment) => this.toInstallmentView(installment)),
      payments: this.toPaymentHistory(plan),
    };
  }

  private static toInstallmentView(
    installment: InstallmentPlanWithDetails['installments'][number]
  ): InstallmentView {
    const balance = this.calculateInstallmentBalanceForPlan(installment);
    const status = determineInstallmentStatus({
      isCancelled: installment.status === InstallmentStatus.CANCELLED,
      dueDate: prismaDateToBusinessDate(installment.dueDate),
      businessDate: todayInBusinessTimezone(),
      balance,
    });

    return {
      id: installment.id,
      installmentNumber: installment.installmentNumber,
      dueDate: prismaDateToBusinessDate(installment.dueDate),
      amountDue: moneyToApiString(installment.amountDue),
      totalPaid: moneyToApiString(balance.totalPaid),
      remainingAmount: moneyToApiString(balance.remainingBalance),
      status,
      storedStatus: installment.status,
      paidDate: installment.paidDate ? prismaDateToBusinessDate(installment.paidDate) : null,
    };
  }

  private static toPaymentHistory(plan: InstallmentPlanWithDetails): InstallmentPlanPaymentView[] {
    const installmentIds = new Set(plan.installments.map((installment) => installment.id));
    const paymentsById = new Map<string, InstallmentPlanPaymentView>();

    for (const installment of plan.installments) {
      for (const allocation of installment.paymentAllocations) {
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
            allocations: payment.allocations
              .filter(
                (paymentAllocation) =>
                  paymentAllocation.installmentId !== null &&
                  installmentIds.has(paymentAllocation.installmentId)
              )
              .map((paymentAllocation) => ({
                id: paymentAllocation.id,
                debtId: paymentAllocation.debtId,
                installmentId: paymentAllocation.installmentId,
                amount: moneyToApiString(paymentAllocation.amount),
                createdAt: paymentAllocation.createdAt.toISOString(),
              })),
          });
        }
      }
    }

    return Array.from(paymentsById.values()).sort((left, right) =>
      left.paymentDate === right.paymentDate
        ? left.createdAt.localeCompare(right.createdAt)
        : left.paymentDate.localeCompare(right.paymentDate)
    );
  }

  private static calculatePlanSummary(plan: InstallmentPlanWithDetails) {
    return calculateInstallmentPlanSummary(
      {
        totalAmount: plan.totalAmount,
        installments: plan.installments.map((installment) => ({
          dueDate: prismaDateToBusinessDate(installment.dueDate),
          amountDue: installment.amountDue,
          status: installment.status,
          allocations: installment.paymentAllocations.map((allocation) => ({
            amount: allocation.amount,
            isVoided: isPaymentAllocationVoided(allocation),
          })),
        })),
      },
      todayInBusinessTimezone()
    );
  }

  private static calculateInstallmentBalanceForPlan(
    installment: InstallmentPlanWithDetails['installments'][number]
  ) {
    return calculateInstallmentBalance({
      amountDue: installment.amountDue,
      allocations: installment.paymentAllocations.map((allocation) => ({
        amount: allocation.amount,
        isVoided: isPaymentAllocationVoided(allocation),
      })),
    });
  }

  private static calculatePlanStatus(plan: InstallmentPlanWithDetails): InstallmentPlanStatus {
    const businessDate = todayInBusinessTimezone();
    return determineInstallmentPlanStatus({
      isCancelled: plan.status === InstallmentPlanStatus.CANCELLED || Boolean(plan.cancelledAt),
      installments: plan.installments.map((installment) => ({
        status: determineInstallmentStatus({
          isCancelled: installment.status === InstallmentStatus.CANCELLED,
          dueDate: prismaDateToBusinessDate(installment.dueDate),
          businessDate,
          balance: this.calculateInstallmentBalanceForPlan(installment),
        }),
      })),
    });
  }
}
