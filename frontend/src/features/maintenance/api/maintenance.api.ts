import { api } from '../../../services/api';
import { MaintenanceOverview, PreflightReport, RepairOutcome, ResolveMigrationOutcome } from '../types/maintenance.types';

interface ApiResponse<T> { success: boolean; data: T }

export const maintenanceApi = {
  overview: async (): Promise<MaintenanceOverview> =>
    (await api.get<ApiResponse<MaintenanceOverview>>('/admin/maintenance')).data.data,

  /** Read-only, safe to run at any time. */
  preflight: async (): Promise<PreflightReport> =>
    (await api.get<ApiResponse<PreflightReport>>('/admin/preflight')).data.data,

  /**
   * The ZIP is authenticated, so it must come through axios rather than a bare
   * link, which cannot send the Bearer token.
   */
  exportDiagnostics: async (): Promise<Blob> =>
    (await api.get('/admin/diagnostics/export', { responseType: 'blob' })).data,

  applyRepairs: async (accountPassword: string): Promise<RepairOutcome[]> =>
    (await api.post<ApiResponse<{ outcomes: RepairOutcome[] }>>('/admin/maintenance/apply', {
      accountPassword,
      confirmation: 'APPLY',
    })).data.data.outcomes,

  /** Records hand-applied updates as done. Runs none of the update's own SQL. */
  resolveMigrations: async (accountPassword: string, migrationNames: string[]): Promise<ResolveMigrationOutcome[]> =>
    (await api.post<ApiResponse<{ outcomes: ResolveMigrationOutcome[] }>>('/admin/maintenance/migrations/resolve', {
      accountPassword,
      migrationNames,
      confirmation: 'RESOLVE',
    })).data.data.outcomes,
};
