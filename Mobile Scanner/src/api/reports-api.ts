import { REPORT_PATHS } from '@shared/report-catalog';
import type { AuthedClient } from './hc-client';
import { lookupGet } from './lookup-http';
import { LOOKUP_PAGE_SIZE } from '../lookup/pagination';
export interface ReportChoice {
  id: string;
  title: string;
  description: string;
  category: string;
  kind: string;
  slice?: string;
  operational?: boolean;
}
export interface ReportFilters {
  period: 'thisMonth' | 'lastMonth' | 'today' | 'thisWeek' | 'custom';
  from?: string;
  to?: string;
  month?: string;
}
export interface ReportRead {
  summary?: Record<string, unknown>;
  rows?: Record<string, unknown>[];
  items?: Record<string, unknown>[];
  pagination?: { page: number; totalPages: number };
  [key: string]: unknown;
}
/** Same endpoint selection as ReportsPage/ReportDetailPage; no mobile-only route. */
export function reportRequest(definition: ReportChoice, filters: ReportFilters, page = 1) {
  if (definition.kind === 'legacy-debts' || definition.kind === 'legacy-activity') {
    return {
      path: `/reports/${definition.kind === 'legacy-debts' ? 'monthly-debts' : 'monthly-financial-activity'}`,
      params: {
        month: filters.month,
        page,
        limit: LOOKUP_PAGE_SIZE,
        ...(definition.kind === 'legacy-debts'
          ? {
              sortBy: 'OUTSTANDING',
              sortOrder: 'DESC',
              includeZero: false,
              includeCancelled: false,
              overdueOnly: false,
            }
          : {}),
      },
    };
  }
  const path =
    definition.kind === 'rows'
      ? REPORT_PATHS[definition.slice as keyof typeof REPORT_PATHS]
      : definition.kind === 'review'
        ? 'monthly-review'
        : 'analysis';
  if (!path) throw new Error('Unknown report');
  return {
    path: `/reports/${path}`,
    params: {
      period: filters.period,
      ...(filters.period === 'custom' ? { from: filters.from, to: filters.to } : {}),
    },
  };
}
export function getReport(
  client: AuthedClient,
  definition: ReportChoice,
  filters: ReportFilters,
  page = 1
) {
  const request = reportRequest(definition, filters, page);
  return lookupGet<ReportRead>(client, request.path, request.params);
}
