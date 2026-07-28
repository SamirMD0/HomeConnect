import { useQuery } from '@tanstack/react-query';
import { receivablesApi } from '../api/receivables.api';
import { ReceivableFilters } from '../types/receivables.types';
import { normalizeReceivableFilters } from '../utils/receivables-query';

export const receivablesQueryKey = (filters: ReceivableFilters = {}) =>
  ['receivables', normalizeReceivableFilters(filters)] as const;

export const receivablesQueryKeyPrefix = ['receivables'] as const;

export const useReceivables = (filters: ReceivableFilters = {}) => {
  const stableFilters = normalizeReceivableFilters(filters);

  return useQuery({
    queryKey: receivablesQueryKey(stableFilters),
    queryFn: () => receivablesApi.getReceivables(stableFilters),
    placeholderData: (previousData) => previousData,
  });
};
