import {
  MonthlyDebtReportFilters,
  MonthlyFinancialActivityFilters,
} from '../types/monthly-reports.types';

export function currentMonthValue(): string {
  return new Date().toISOString().slice(0, 7);
}

export function normalizeMonthlyDebtFilters(
  filters: MonthlyDebtReportFilters
): Required<Pick<MonthlyDebtReportFilters, 'month' | 'page' | 'limit' | 'sortBy' | 'sortOrder'>> &
  MonthlyDebtReportFilters {
  return {
    month: filters.month,
    search: filters.search?.trim() || undefined,
    includeZero: filters.includeZero ?? false,
    includeCancelled: filters.includeCancelled ?? false,
    overdueOnly: filters.overdueOnly ?? false,
    page: filters.page ?? 1,
    limit: filters.limit ?? 50,
    sortBy: filters.sortBy ?? 'OUTSTANDING',
    sortOrder: filters.sortOrder ?? 'DESC',
  };
}

export function buildMonthlyDebtParams(filters: MonthlyDebtReportFilters) {
  const normalized = normalizeMonthlyDebtFilters(filters);

  return {
    month: normalized.month,
    mode: 'SNAPSHOT',
    search: normalized.search,
    includeZero: normalized.includeZero,
    includeCancelled: normalized.includeCancelled,
    overdueOnly: normalized.overdueOnly,
    page: normalized.page,
    limit: normalized.limit,
    sortBy: normalized.sortBy,
    sortOrder: normalized.sortOrder,
  };
}

export function normalizeActivityFilters(
  filters: MonthlyFinancialActivityFilters
): Required<Pick<MonthlyFinancialActivityFilters, 'month' | 'page' | 'limit'>> &
  MonthlyFinancialActivityFilters {
  return {
    month: filters.month,
    customerId: filters.customerId,
    page: filters.page ?? 1,
    limit: filters.limit ?? 50,
  };
}

export function buildActivityParams(filters: MonthlyFinancialActivityFilters) {
  return normalizeActivityFilters(filters);
}
