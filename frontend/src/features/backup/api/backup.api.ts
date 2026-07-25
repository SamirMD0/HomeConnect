import { api } from '../../../services/api';
import {
  ApiResponse,
  BackupListData,
  BackupSettings,
  BackupStatusData,
  RestoreResultData,
  RestoreValidationData,
} from '../types/backup.types';

export const backupApi = {
  getStatus: async (): Promise<BackupStatusData> => {
    const response = await api.get<ApiResponse<BackupStatusData>>('/admin/backups/status');
    return response.data.data;
  },

  getSettings: async (): Promise<BackupSettings> => {
    const response = await api.get<ApiResponse<BackupSettings>>('/admin/backups/settings');
    return response.data.data;
  },

  updateSettings: async (settings: Partial<BackupSettings>): Promise<BackupSettings> => {
    const response = await api.put<ApiResponse<BackupSettings>>('/admin/backups/settings', settings);
    return response.data.data;
  },

  listBackups: async (): Promise<BackupListData> => {
    const response = await api.get<ApiResponse<BackupListData>>('/admin/backups', {
      params: { page: 1, limit: 50, sortOrder: 'DESC' },
    });
    return response.data.data;
  },

  createManualBackup: async () => {
    const response = await api.post('/admin/backups', { type: 'MANUAL' });
    return response.data.data;
  },

  validateRestore: async (backupId: string): Promise<RestoreValidationData> => {
    const response = await api.post<ApiResponse<RestoreValidationData>>(
      `/admin/backups/${backupId}/validate-restore`,
      {}
    );
    return response.data.data;
  },

  restoreBackup: async (backupId: string, confirmation: 'RESTORE'): Promise<RestoreResultData> => {
    const response = await api.post<ApiResponse<RestoreResultData>>(
      `/admin/backups/${backupId}/restore`,
      { confirmation }
    );
    return response.data.data;
  },
};
