import { api } from '../../../services/api';
import {
  MonthlyDebtReportData,
  MonthlyDebtReportFilters,
  MonthlyDebtReportResponse,
  MonthlyFinancialActivityData,
  MonthlyFinancialActivityFilters,
  MonthlyFinancialActivityResponse,
} from '../types/monthly-reports.types';
import { buildActivityParams, buildMonthlyDebtParams } from '../utils/report-query';

export const monthlyReportsApi = {
  getMonthlyDebtReport: async (
    filters: MonthlyDebtReportFilters
  ): Promise<MonthlyDebtReportData> => {
    const response = await api.get<MonthlyDebtReportResponse>('/reports/monthly-debts', {
      params: buildMonthlyDebtParams(filters),
    });
    return response.data.data;
  },

  getMonthlyFinancialActivity: async (
    filters: MonthlyFinancialActivityFilters
  ): Promise<MonthlyFinancialActivityData> => {
    const response = await api.get<MonthlyFinancialActivityResponse>(
      '/reports/monthly-financial-activity',
      { params: buildActivityParams(filters) }
    );
    return response.data.data;
  },

  exportMonthlyDebtCsv: async (filters: MonthlyDebtReportFilters): Promise<Blob> => {
    const response = await api.get<Blob>('/reports/monthly-debts/export.csv', {
      params: buildMonthlyDebtParams({ ...filters, page: 1, limit: 10000 }),
      responseType: 'blob',
    });
    return response.data;
  },

  exportMonthlyActivityCsv: async (filters: MonthlyFinancialActivityFilters): Promise<Blob> => {
    const response = await api.get<Blob>('/reports/monthly-financial-activity/export.csv', {
      params: buildActivityParams({ ...filters, page: 1, limit: 10000 }),
      responseType: 'blob',
    });
    return response.data;
  },
};
