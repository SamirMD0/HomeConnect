import { useQuery } from '@tanstack/react-query';
import { financialLedgerApi } from '../api/financial-ledger.api';
import { FinancialLedgerFilters } from '../types/financial-ledger.types';
import { normalizeFinancialLedgerFilters } from '../utils/ledger-query';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';

export const financialLedgerQueryKey = (filters: FinancialLedgerFilters = {}) =>
  ['financial-ledger', normalizeFinancialLedgerFilters(filters)] as const;

export const financialLedgerQueryKeyPrefix = ['financial-ledger'] as const;

export const useFinancialLedger = (filters: FinancialLedgerFilters = {}) => {
  // The input stays responsive; the query fires once typing pauses.
  const debouncedSearch = useDebouncedValue(filters.search ?? '');
  const stableFilters = normalizeFinancialLedgerFilters({
    ...filters,
    search: debouncedSearch || undefined,
  });

  return useQuery({
    queryKey: financialLedgerQueryKey(stableFilters),
    queryFn: () => financialLedgerApi.getFinancialLedger(stableFilters),
    placeholderData: (previousData) => previousData,
  });
};
