import { useQuery } from '@tanstack/react-query';
import { maintenanceApi } from '../api/maintenance.api';
import { maintenanceKeys } from './useMaintenance';

export function useThermalReconcileNotes() {
  return useQuery({
    queryKey: [...maintenanceKeys.all, 'thermal-reconcile-notes'],
    queryFn: maintenanceApi.thermalReconcileNotes,
  });
}
