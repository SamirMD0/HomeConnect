import { useQuery } from '@tanstack/react-query';
import { reportRowsApi } from '../api/report-rows.api';
import type { ReportRowsQuery, ReportSlice } from '../types/report-rows.types';

export const reportRowsQueryKey = (slice: ReportSlice, query: ReportRowsQuery) =>
  ['reports', 'rows', slice, query.period, query.from ?? null, query.to ?? null] as const;

export function useReportRows(slice: ReportSlice, query: ReportRowsQuery) {
  const complete = query.period !== 'custom' || Boolean(query.from && query.to);
  return useQuery({
    queryKey: reportRowsQueryKey(slice, query),
    queryFn: () => reportRowsApi.get(slice, query),
    enabled: complete,
    staleTime: 60_000,
  });
}
