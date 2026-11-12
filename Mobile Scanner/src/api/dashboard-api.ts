import type { DashboardRead } from '@shared/lookup-contracts';
import { lookupGet } from './lookup-http';
import type { AuthedClient } from './hc-client';
/** frontend/features/dashboard/api/dashboard.api.ts: data contains its own meta/data envelope. */
export interface DashboardFilters {
  range: 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
  from?: string;
  to?: string;
  includeArchived?: boolean;
}
export const getDashboard = (client: AuthedClient, filters: DashboardFilters) =>
  lookupGet<DashboardRead>(client, '/dashboard/overview', filters);
