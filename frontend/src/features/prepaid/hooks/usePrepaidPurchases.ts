import { useQuery } from '@tanstack/react-query';
import { prepaidApi } from '../api/prepaid.api';
import { PrepaidFilters } from '../types/prepaid.types';
import { normalizePrepaidFilters } from '../utils/prepaid-query';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';

export const prepaidQueryKeyPrefix = ['prepaid-purchases'] as const;

export const prepaidQueryKey = (filters: PrepaidFilters = {}) =>
  [...prepaidQueryKeyPrefix, 'list', normalizePrepaidFilters(filters)] as const;

export const prepaidDetailQueryKey = (id: string) =>
  [...prepaidQueryKeyPrefix, 'detail', id] as const;

export const usePrepaidPurchases = (filters: PrepaidFilters = {}) => {
  // The input stays responsive; the query fires once typing pauses.
  const debouncedSearch = useDebouncedValue(filters.search ?? '');
  const stableFilters = normalizePrepaidFilters({
    ...filters,
    search: debouncedSearch || undefined,
  });

  return useQuery({
    queryKey: prepaidQueryKey(stableFilters),
    queryFn: () => prepaidApi.listPrepaidPurchases(stableFilters),
    placeholderData: (previousData) => previousData,
  });
};

export const usePrepaidPurchase = (id: string | null) =>
  useQuery({
    queryKey: prepaidDetailQueryKey(id ?? ''),
    queryFn: () => prepaidApi.getPrepaidPurchase(id!),
    enabled: Boolean(id),
  });
