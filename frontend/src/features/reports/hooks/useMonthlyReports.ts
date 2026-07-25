import { useQuery } from '@tanstack/react-query';
import { monthlyReportsApi } from '../api/monthly-reports.api';
import {
  MonthlyDebtReportFilters,
  MonthlyFinancialActivityFilters,
} from '../types/monthly-reports.types';
import { normalizeActivityFilters, normalizeMonthlyDebtFilters } from '../utils/report-query';

export const monthlyDebtReportQueryKey = (filters: MonthlyDebtReportFilters) =>
  ['reports', 'monthly-debts', normalizeMonthlyDebtFilters(filters)] as const;

export const monthlyActivityReportQueryKey = (filters: MonthlyFinancialActivityFilters) =>
  ['reports', 'monthly-financial-activity', normalizeActivityFilters(filters)] as const;

export const monthlyReportsQueryKeyPrefix = ['reports'] as const;

export function useMonthlyDebtReport(filters: MonthlyDebtReportFilters) {
  const normalized = normalizeMonthlyDebtFilters(filters);

  return useQuery({
    queryKey: monthlyDebtReportQueryKey(normalized),
    queryFn: () => monthlyReportsApi.getMonthlyDebtReport(normalized),
    placeholderData: (previousData) => previousData,
  });
}

export function useMonthlyFinancialActivity(filters: MonthlyFinancialActivityFilters) {
  const normalized = normalizeActivityFilters(filters);

  return useQuery({
    queryKey: monthlyActivityReportQueryKey(normalized),
    queryFn: () => monthlyReportsApi.getMonthlyFinancialActivity(normalized),
    placeholderData: (previousData) => previousData,
  });
}
