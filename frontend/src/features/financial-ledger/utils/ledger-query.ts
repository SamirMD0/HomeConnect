import { FinancialLedgerFilters } from '../types/financial-ledger.types';

export function normalizeFinancialLedgerFilters(
  filters: FinancialLedgerFilters = {}
): Required<Pick<FinancialLedgerFilters, 'type' | 'includeCancelled' | 'page' | 'limit' | 'sortBy' | 'sortOrder'>> &
  Omit<FinancialLedgerFilters, 'type' | 'includeCancelled' | 'page' | 'limit' | 'sortBy' | 'sortOrder'> {
  return {
    type: filters.type ?? 'ALL',
    status: filters.status,
    customerId: filters.customerId,
    search: filters.search?.trim() || undefined,
    dueFrom: filters.dueFrom || undefined,
    dueTo: filters.dueTo || undefined,
    paymentFrom: filters.paymentFrom || undefined,
    paymentTo: filters.paymentTo || undefined,
    includeCancelled: filters.includeCancelled ?? false,
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
    sortBy: filters.sortBy ?? 'date',
    sortOrder: filters.sortOrder ?? 'asc',
  };
}

export function buildFinancialLedgerParams(filters: FinancialLedgerFilters = {}) {
  const normalized = normalizeFinancialLedgerFilters(filters);
  return Object.fromEntries(
    Object.entries(normalized).filter(([, value]) => value !== undefined && value !== '')
  );
}
