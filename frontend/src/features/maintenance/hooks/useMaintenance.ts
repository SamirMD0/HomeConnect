import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { maintenanceApi } from '../api/maintenance.api';

export const maintenanceKeys = {
  all: ['maintenance'] as const,
  overview: () => [...maintenanceKeys.all, 'overview'] as const,
  preflight: () => [...maintenanceKeys.all, 'preflight'] as const,
};

export function useMaintenanceOverview() {
  return useQuery({ queryKey: maintenanceKeys.overview(), queryFn: maintenanceApi.overview });
}

/**
 * Preflight is not fetched on mount — it opens sockets and probes the database,
 * which is not something to do every time Settings is opened. The admin asks
 * for it.
 */
export function usePreflightReport(enabled: boolean) {
  return useQuery({ queryKey: maintenanceKeys.preflight(), queryFn: maintenanceApi.preflight, enabled });
}

export function useApplyRepairs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accountPassword: string) => maintenanceApi.applyRepairs(accountPassword),
    // Pending repairs, history and preflight all change once repairs run.
    onSettled: () => queryClient.invalidateQueries({ queryKey: maintenanceKeys.all }),
  });
}
