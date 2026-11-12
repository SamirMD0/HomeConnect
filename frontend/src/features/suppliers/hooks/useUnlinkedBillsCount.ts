import { useQuery } from '@tanstack/react-query';
import { supplierBillsApi } from '../api/supplier-bills.api';

/**
 * Bills photographed on a phone without a purchase yet. Shown as a badge on the
 * Suppliers navigation item so the office knows bills are waiting.
 */
export function useUnlinkedBillsCount(): number {
  const query = useQuery({
    queryKey: ['supplier-bills', 'unlinked-count'],
    queryFn: supplierBillsApi.unlinkedCount,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
  return query.data ?? 0;
}
