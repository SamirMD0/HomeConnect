import { ReceivableFilters } from '../types/receivables.types';

export type NormalizedReceivableFilters = Required<
  Pick<
    ReceivableFilters,
    'tier' | 'onlyWithBalance' | 'includeInactive' | 'page' | 'limit' | 'sortBy' | 'sortOrder'
  >
> &
  Pick<ReceivableFilters, 'search' | 'month'>;

export function normalizeReceivableFilters(
  filters: ReceivableFilters = {}
): NormalizedReceivableFilters {
  return {
    search: filters.search?.trim() || undefined,
    month: filters.month || undefined,
    tier: [...(filters.tier ?? [])].sort(),
    onlyWithBalance: filters.onlyWithBalance ?? false,
    includeInactive: filters.includeInactive ?? false,
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
    sortBy: filters.sortBy ?? 'standing',
    sortOrder: filters.sortOrder ?? 'desc',
  };
}

export function buildReceivableParams(filters: ReceivableFilters = {}) {
  const normalized = normalizeReceivableFilters(filters);
  return Object.fromEntries(
    Object.entries(normalized).filter(([key, value]) => {
      if (key === 'tier') return Array.isArray(value) && value.length > 0;
      return value !== undefined && value !== '';
    })
  );
}

export function hasActiveReceivableFilters(filters: ReceivableFilters = {}): boolean {
  const normalized = normalizeReceivableFilters(filters);
  return Boolean(
    normalized.search ||
      normalized.month ||
      normalized.tier.length > 0 ||
      normalized.onlyWithBalance ||
      normalized.includeInactive
  );
}
