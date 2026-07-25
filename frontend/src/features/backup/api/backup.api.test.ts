import { beforeEach, describe, expect, it, vi } from 'vitest';
import { backupApi } from './backup.api';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({
  api: apiMock,
}));

describe('backupApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches backup status and list from admin endpoints', async () => {
    apiMock.get
      .mockResolvedValueOnce({ data: { success: true, data: { system: { status: 'NORMAL' } } } })
      .mockResolvedValueOnce({ data: { success: true, data: { items: [] } } });

    await backupApi.getStatus();
    await backupApi.listBackups();

    expect(apiMock.get).toHaveBeenNthCalledWith(1, '/admin/backups/status');
    expect(apiMock.get).toHaveBeenNthCalledWith(2, '/admin/backups', {
      params: { page: 1, limit: 50, sortOrder: 'DESC' },
    });
  });

  it('updates backup settings without exposing credentials', async () => {
    apiMock.put.mockResolvedValue({
      data: { success: true, data: { backupDirectory: 'C:/Backups' } },
    });

    await backupApi.updateSettings({ backupDirectory: 'C:/Backups', automaticRetentionCount: 30 });

    expect(apiMock.put).toHaveBeenCalledWith('/admin/backups/settings', {
      backupDirectory: 'C:/Backups',
      automaticRetentionCount: 30,
    });
  });

  it('creates manual backups and enforces restore confirmation payload', async () => {
    apiMock.post
      .mockResolvedValueOnce({ data: { success: true, data: { filename: 'backup.backup' } } })
      .mockResolvedValueOnce({ data: { success: true, data: { archiveReadable: true } } })
      .mockResolvedValueOnce({ data: { success: true, data: { restartRequired: true } } });

    await backupApi.createManualBackup();
    await backupApi.validateRestore('backup-id');
    await backupApi.restoreBackup('backup-id', 'RESTORE');

    expect(apiMock.post).toHaveBeenNthCalledWith(1, '/admin/backups', { type: 'MANUAL' });
    expect(apiMock.post).toHaveBeenNthCalledWith(
      2,
      '/admin/backups/backup-id/validate-restore',
      {}
    );
    expect(apiMock.post).toHaveBeenNthCalledWith(
      3,
      '/admin/backups/backup-id/restore',
      { confirmation: 'RESTORE' }
    );
  });
});
