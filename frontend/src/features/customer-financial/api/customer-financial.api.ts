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
    const debt = response.data.data;
    // The detail endpoint sends the computed status as `status`; the summary
    // list calls it `calculatedStatus`. Normalise so badges and actions work.
    return { ...debt, calculatedStatus: debt.calculatedStatus ?? debt.status };
  },

  getInstallmentPlanDetail: async (planId: string): Promise<InstallmentPlanDetail> => {
    const response = await api.get<ApiEnvelope<InstallmentPlanDetail>>(
      `/installment-plans/${planId}`
    );
    return response.data.data;
  },
};
