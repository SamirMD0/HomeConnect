import { useQuery } from '@tanstack/react-query';
import { monthlyReviewApi } from '../api/monthly-review.api';
import type { MonthlyReviewQuery } from '../types/monthly-review.types';

export const monthlyReviewQueryKey = (query: MonthlyReviewQuery) =>
  ['reports', 'monthly-review', query.period, query.from ?? null, query.to ?? null] as const;

export function useMonthlyReview(query: MonthlyReviewQuery, enabled = true) {
  const completeCustomRange = query.period !== 'custom' || Boolean(query.from && query.to);
  return useQuery({
    queryKey: monthlyReviewQueryKey(query),
    queryFn: () => monthlyReviewApi.get(query),
    enabled: enabled && completeCustomRange,
    staleTime: 60_000,
  });
}
