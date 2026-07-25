import { useQuery } from '@tanstack/react-query';
import { financialLedgerApi } from '../api/financial-ledger.api';
import { FinancialLedgerFilters } from '../types/financial-ledger.types';
import { normalizeFinancialLedgerFilters } from '../utils/ledger-query';

export const financialLedgerQueryKey = (filters: FinancialLedgerFilters = {}) =>
  ['financial-ledger', normalizeFinancialLedgerFilters(filters)] as const;

export const financialLedgerQueryKeyPrefix = ['financial-ledger'] as const;

export const useFinancialLedger = (filters: FinancialLedgerFilters = {}) => {
  const stableFilters = normalizeFinancialLedgerFilters(filters);

  return useQuery({
    queryKey: financialLedgerQueryKey(stableFilters),
    queryFn: () => financialLedgerApi.getFinancialLedger(stableFilters),
    placeholderData: (previousData) => previousData,
  });
};
