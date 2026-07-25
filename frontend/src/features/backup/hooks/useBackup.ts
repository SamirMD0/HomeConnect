import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { backupApi } from '../api/backup.api';
import { BackupSettings } from '../types/backup.types';

export const backupQueryKeyPrefix = ['backup'] as const;

export function useBackupStatus() {
  return useQuery({
    queryKey: ['backup', 'status'],
    queryFn: backupApi.getStatus,
  });
}

export function useBackupSettings() {
  return useQuery({
    queryKey: ['backup', 'settings'],
    queryFn: backupApi.getSettings,
  });
}

export function useBackupList() {
  return useQuery({
    queryKey: ['backup', 'list'],
    queryFn: backupApi.listBackups,
  });
}

export function useCreateBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: backupApi.createManualBackup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: backupQueryKeyPrefix }),
  });
}

export function useUpdateBackupSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: Partial<BackupSettings>) => backupApi.updateSettings(settings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: backupQueryKeyPrefix }),
  });
}
