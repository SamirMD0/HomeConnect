import {
  DebtStatus,
  InstallmentPlanFrequency,
  InstallmentPlanStatus,
  InstallmentStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BusinessDate } from './business-date';

export type Money = Decimal;

export interface PaymentAllocationAmount {
  amount: Decimal;
  isVoided?: boolean;
}

export interface DebtBalanceInput {
  originalAmount: Decimal;
  allocations?: PaymentAllocationAmount[];
}

export interface ObligationBalance {
  totalPaid: Decimal;
  remainingBalance: Decimal;
  isFullyPaid: boolean;
  isPartiallyPaid: boolean;
}

export interface InstallmentBalanceInput {
  amountDue: Decimal;
  allocations?: PaymentAllocationAmount[];
}

export interface InstallmentSummaryInput {
  id?: string;
  dueDate: BusinessDate;
  amountDue: Decimal;
  status?: InstallmentStatus;
  allocations?: PaymentAllocationAmount[];
}

export interface InstallmentPlanSummaryInput {
  totalAmount: Decimal;
  installments: InstallmentSummaryInput[];
}

export interface InstallmentPlanSummary {
  totalPaid: Decimal;
  remainingBalance: Decimal;
  completedInstallmentCount: number;
  overdueInstallmentCount: number;
  nextDueDate: BusinessDate | null;
}

export interface GeneratedInstallment {
  installmentNumber: number;
  dueDate: BusinessDate;
  amountDue: Decimal;
}

export interface GenerateMonthlyInstallmentScheduleInput {
  totalAmount: Decimal | string;
  startDate: BusinessDate;
  installmentCount: number;
  frequency: InstallmentPlanFrequency;
}

export interface DebtStatusInput {
  isCancelled: boolean;
  dueDate: BusinessDate;
  businessDate: BusinessDate;
  balance: ObligationBalance;
  overdueEligible?: boolean;
}

export interface InstallmentStatusInput {
  isCancelled: boolean;
  dueDate: BusinessDate;
  businessDate: BusinessDate;
  balance: ObligationBalance;
}

export interface InstallmentPlanStatusInput {
  isCancelled: boolean;
  installments: Array<{
    status: InstallmentStatus;
  }>;
}

export interface PlanAllocationInstallmentInput {
  id: string;
  dueDate: BusinessDate;
  installmentNumber: number;
  amountDue: Decimal;
  amountPaid: Decimal;
  status: InstallmentStatus;
}

export interface PlanPaymentAllocationInstruction {
  installmentId: string;
  amount: Decimal;
}

export interface DebtAllocationInput {
  debtId: string;
  paymentAmount: Decimal | string;
  remainingBalance: Decimal;
  status?: DebtStatus;
}

export interface DebtPaymentAllocationInstruction {
  debtId: string;
  amount: Decimal;
}

export interface FinancialMutationUser {
  userId: string;
  role: string;
}

export type FinancialMutationAction =
  | 'create_debt'
  | 'create_installment_plan'
  | 'record_payment'
  | 'cancel_debt'
  | 'cancel_installment_plan'
  | 'void_payment';

export { DebtStatus, InstallmentPlanFrequency, InstallmentPlanStatus, InstallmentStatus };
