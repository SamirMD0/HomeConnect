import { api } from '../../../services/api';
import {
  ApiEnvelope,
  CustomerFinancialSummary,
  CustomerFinancialSummaryOptions,
  CustomerFinancialSummaryResponse,
  DebtDetail,
  InstallmentPlanDetail,
} from '../types/customer-financial.types';

export const customerFinancialApi = {
  getCustomerFinancialSummary: async (
    customerId: string,
    options?: CustomerFinancialSummaryOptions
  ): Promise<CustomerFinancialSummary> => {
    const response = await api.get<CustomerFinancialSummaryResponse>(
      `/customers/${customerId}/financial-summary`,
      {
        params: options,
      }
    );
    return response.data.data;
  },

  getDebtDetail: async (debtId: string): Promise<DebtDetail> => {
    const response = await api.get<ApiEnvelope<DebtDetail>>(`/debts/${debtId}`);
    return response.data.data;
  },

  getInstallmentPlanDetail: async (planId: string): Promise<InstallmentPlanDetail> => {
    const response = await api.get<ApiEnvelope<InstallmentPlanDetail>>(
      `/installment-plans/${planId}`
    );
    return response.data.data;
  },
};
