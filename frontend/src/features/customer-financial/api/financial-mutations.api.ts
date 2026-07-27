import { api } from '../../../services/api';
import {
  ApiEnvelope,
  CancelFinancialRecordRequest,
  CreateDebtRequest,
  CreateInstallmentPlanRequest,
  DebtDetail,
  InstallmentPlanDetail,
  RecordDebtPaymentRequest,
  ReallocatePaymentRequest,
  RecordInstallmentPlanPaymentRequest,
  UpdateDebtRequest,
  UpdateInstallmentPlanRequest,
  VoidPaymentRequest,
} from '../types/customer-financial.types';

export const financialMutationsApi = {
  createDebt: async (customerId: string, data: CreateDebtRequest): Promise<DebtDetail> => {
    const response = await api.post<ApiEnvelope<DebtDetail>>(`/customers/${customerId}/debts`, data);
    return response.data.data;
  },

  recordDebtPayment: async (
    debtId: string,
    data: RecordDebtPaymentRequest
  ): Promise<DebtDetail> => {
    const response = await api.post<ApiEnvelope<DebtDetail>>(`/debts/${debtId}/payments`, data);
    return response.data.data;
  },

  updateDebt: async (
    debtId: string,
    data: UpdateDebtRequest
  ): Promise<DebtDetail> => {
    const response = await api.post<ApiEnvelope<DebtDetail>>(`/debts/${debtId}/corrections`, data);
    return response.data.data;
  },

  cancelDebt: async (
    debtId: string,
    data: CancelFinancialRecordRequest
  ): Promise<DebtDetail> => {
    const response = await api.post<ApiEnvelope<DebtDetail>>(`/debts/${debtId}/cancel`, data);
    return response.data.data;
  },

  voidPayment: async (
    paymentId: string,
    data: VoidPaymentRequest
  ): Promise<{ paymentId: string; customerId: string; action: string; replacementPaymentId: string | null; voidedAt: string | null }> => {
    const response = await api.post<ApiEnvelope<{ paymentId: string; customerId: string; action: string; replacementPaymentId: string | null; voidedAt: string | null }>>(
      `/payments/${paymentId}/void`,
      data
    );
    return response.data.data;
  },

  reallocatePayment: async (
    paymentId: string,
    data: ReallocatePaymentRequest
  ): Promise<{ paymentId: string; customerId: string; action: string; replacementPaymentId: string | null; voidedAt: string | null }> => {
    const response = await api.post<ApiEnvelope<{ paymentId: string; customerId: string; action: string; replacementPaymentId: string | null; voidedAt: string | null }>>(
      `/payments/${paymentId}/reallocate`,
      data
    );
    return response.data.data;
  },

  createInstallmentPlan: async (
    customerId: string,
    data: CreateInstallmentPlanRequest
  ): Promise<InstallmentPlanDetail> => {
    const response = await api.post<ApiEnvelope<InstallmentPlanDetail>>(
      `/customers/${customerId}/installment-plans`,
      data
    );
    return response.data.data;
  },

  updateInstallmentPlan: async (
    planId: string,
    data: UpdateInstallmentPlanRequest
  ): Promise<InstallmentPlanDetail> => {
    const response = await api.post<ApiEnvelope<InstallmentPlanDetail>>(
      `/installment-plans/${planId}/corrections`,
      data
    );
    return response.data.data;
  },

  recordInstallmentPlanPayment: async (
    planId: string,
    data: RecordInstallmentPlanPaymentRequest
  ): Promise<InstallmentPlanDetail> => {
    const response = await api.post<ApiEnvelope<InstallmentPlanDetail>>(
      `/installment-plans/${planId}/payments`,
      data
    );
    return response.data.data;
  },

  cancelInstallmentPlan: async (
    planId: string,
    data: CancelFinancialRecordRequest
  ): Promise<InstallmentPlanDetail> => {
    const response = await api.post<ApiEnvelope<InstallmentPlanDetail>>(
      `/installment-plans/${planId}/cancel`,
      data
    );
    return response.data.data;
  },
};
