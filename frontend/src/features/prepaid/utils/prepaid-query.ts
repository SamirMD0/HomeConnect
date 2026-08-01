import { PrepaidFilters } from '../types/prepaid.types';

export const defaultPrepaidFilters: Required<
  Pick<PrepaidFilters, 'status' | 'sortBy' | 'sortOrder' | 'page' | 'pageSize' | 'fullyPaidOnly'>
> = {
  status: 'PENDING',
  sortBy: 'createdAt',
  sortOrder: 'desc',
  page: 1,
  pageSize: 25,
  fullyPaidOnly: false,
};

/** Stable shape so identical filter objects share one cache entry. */
export function normalizePrepaidFilters(filters: PrepaidFilters = {}) {
  return {
    ...defaultPrepaidFilters,
    ...filters,
    search: filters.search?.trim() || undefined,
  };
}

export function buildPrepaidParams(filters: PrepaidFilters = {}) {
  const normalized = normalizePrepaidFilters(filters);
  return {
    status: normalized.status,
    sortBy: normalized.sortBy,
    sortOrder: normalized.sortOrder,
    page: normalized.page,
    pageSize: normalized.pageSize,
    ...(normalized.fullyPaidOnly ? { fullyPaidOnly: 'true' } : {}),
    ...(normalized.customerId ? { customerId: normalized.customerId } : {}),
    ...(normalized.search ? { search: normalized.search } : {}),
    ...(normalized.dateFrom ? { dateFrom: normalized.dateFrom } : {}),
    ...(normalized.dateTo ? { dateTo: normalized.dateTo } : {}),
  };
}

export function resetPrepaidFilters(): PrepaidFilters {
  return { ...defaultPrepaidFilters };
}

export function hasActivePrepaidFilters(filters: PrepaidFilters): boolean {
  return Boolean(
    filters.search?.trim() ||
      filters.customerId ||
      filters.dateFrom ||
      filters.dateTo ||
      filters.fullyPaidOnly ||
      (filters.status && filters.status !== defaultPrepaidFilters.status)
  );
}

export function countActivePrepaidFilters(filters: PrepaidFilters): number {
  return [
    Boolean(filters.search?.trim()),
    Boolean(filters.customerId),
    Boolean(filters.dateFrom),
    Boolean(filters.dateTo),
    Boolean(filters.fullyPaidOnly),
  ].filter(Boolean).length;
}
