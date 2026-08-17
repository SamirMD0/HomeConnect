import { useQuery } from '@tanstack/react-query';
import { analysisApi } from '../api/analysis.api';
import type { MonthlyReviewQuery } from '../types/monthly-review.types';

export const analysisQueryKey = (query: MonthlyReviewQuery) =>
  ['reports', 'analysis', query.period, query.from ?? null, query.to ?? null] as const;

export function useAnalysis(query: MonthlyReviewQuery, enabled = true) {
  const completeCustomRange = query.period !== 'custom' || Boolean(query.from && query.to);
  return useQuery({
    queryKey: analysisQueryKey(query),
    queryFn: () => analysisApi.get(query),
    enabled: enabled && completeCustomRange,
    staleTime: 60_000,
  });
}
