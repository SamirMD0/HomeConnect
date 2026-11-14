import type { ReadPage } from '@shared/lookup-contracts';
import { authedHeaders, requestJson, type AuthedClient } from './hc-client';

/** Same route and fields as the PC Receivables page (/api/v1/receivables). */
export type ReceivableTier = 'NO_ACTIVITY' | 'CURRENT' | 'WATCH' | 'LATE' | 'SEVERE' | 'CRITICAL';
export type ReceivableSort = 'outstanding' | 'overdue' | 'standing' | 'name';

export interface ReceivableItem {
  branchId: string;
  customer: { id: string; name: string; phone: string; isActive: boolean };
  tier: ReceivableTier;
  tierReason: string;
  maxOverdueDays: number;
  outstanding: string;
  overdueAmount: string;
  nextDueDate: string | null;
  lastPaymentDate: string | null;
}
export interface ReceivablesSummary {
  customerCount: number;
  customersWithBalance: number;
  customersOverdue: number;
  atRiskCount: number;
  totalOutstanding: string;
  totalOverdue: string;
}
export interface ReceivablesResponse {
  businessDate: string;
  summary: ReceivablesSummary;
  tierCounts: Record<ReceivableTier, number>;
  items: ReceivableItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
export interface ReceivablesFilters {
  search?: string;
  /** Empty means every standing. */
  tiers?: ReceivableTier[];
  sortBy?: ReceivableSort;
}

/** Worst first, like the PC filter chips. */
export const receivableTierOrder: ReceivableTier[] = ['CRITICAL', 'SEVERE', 'LATE', 'WATCH', 'CURRENT', 'NO_ACTIVITY'];
export const receivableTierLabels: Record<ReceivableTier, string> = {
  CRITICAL: 'Critical',
  SEVERE: 'Severe',
  LATE: 'Late',
  WATCH: 'Watch',
  CURRENT: 'Current',
  NO_ACTIVITY: 'No activity',
};
/** Tiers with money past due. Matches the PC's "overdue" meaning (WATCH and worse). */
export const overdueTiers: ReceivableTier[] = ['CRITICAL', 'SEVERE', 'LATE', 'WATCH'];

export const RECEIVABLES_PAGE_SIZE = 25;
/** The PC wants one tier= per standing (it rejects a comma list), so build the query here. */
export function receivablesQuery(filters: ReceivablesFilters, page: number, limit: number): string {
  const params = new URLSearchParams();
  if (filters.search?.trim()) params.set('search', filters.search.trim());
  for (const tier of filters.tiers ?? []) params.append('tier', tier);
  params.set('onlyWithBalance', 'true');
  params.set('sortBy', filters.sortBy ?? 'outstanding');
  params.set('sortOrder', filters.sortBy === 'name' ? 'asc' : 'desc');
  params.set('page', String(page));
  params.set('limit', String(limit));
  return params.toString();
}
const fetchReceivables = (client: AuthedClient, filters: ReceivablesFilters, page: number, limit: number) =>
  requestJson<ReceivablesResponse>(`${client.baseUrl}/api/v1/receivables?${receivablesQuery(filters, page, limit)}`, {
    method: 'GET',
    headers: authedHeaders(client),
  });

export type ReceivablesPage = ReadPage<ReceivableItem> & {
  summary: ReceivablesSummary;
  tierCounts: ReceivablesResponse['tierCounts'];
};
/** One page of customers who owe money, plus totals for the current filters. */
export async function getReceivablesPage(
  client: AuthedClient,
  filters: ReceivablesFilters,
  page: number
): Promise<ReceivablesPage> {
  const data = await fetchReceivables(client, filters, page, RECEIVABLES_PAGE_SIZE);
  if (!data || !Array.isArray(data.items))
    throw new Error('The PC returned an invalid receivables list. Update Home Connect and retry.');
  return {
    items: data.items,
    nextPage: page < data.pagination.totalPages ? page + 1 : undefined,
    summary: data.summary,
    tierCounts: data.tierCounts,
  };
}

/** Totals only, for the Home card: one row is the smallest page the PC returns. */
export async function getReceivablesSummary(client: AuthedClient): Promise<ReceivablesSummary> {
  return (await fetchReceivables(client, {}, 1, 1)).summary;
}
