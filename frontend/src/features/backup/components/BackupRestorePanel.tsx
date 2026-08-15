import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, FolderOpen, RefreshCw, RotateCcw, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '../../../components/ui/Modal';
import { backupApi } from '../api/backup.api';
import {
  useBackupList,
  useBackupSettings,
  useBackupStatus,
  useCreateBackup,
  useUpdateBackupSettings,
} from '../hooks/useBackup';
import { BackupRecord, BackupSettings, RestoreValidationData } from '../types/backup.types';

const retentionOptions = [7, 14, 30, 60, 90];

export const BackupRestorePanel: React.FC = () => {
  const statusQuery = useBackupStatus();
  const settingsQuery = useBackupSettings();
  const listQuery = useBackupList();
  const createBackup = useCreateBackup();
  const updateSettings = useUpdateBackupSettings();
  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null);
  const [isImportingBackup, setIsImportingBackup] = useState(false);

  if (statusQuery.isLoading || settingsQuery.isLoading || listQuery.isLoading) {
    return <div className="h-48 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />;
  }

  if (statusQuery.isError || settingsQuery.isError || listQuery.isError || !settingsQuery.data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-800" role="alert">
        Backup settings failed to load.
      </div>
    );
  }

  const settings = settingsQuery.data;

  const handleCreateBackup = async () => {
    try {
      await createBackup.mutateAsync();
      toast.success('Backup completed');
    } catch {
      toast.error('Backup failed');
    }
  };

  const handleSelectFolder = async () => {
    if (!window.electronAPI?.selectBackupDirectory) {
      toast.error('Folder selection is available in the desktop app');
      return;
    }

    const selected = await window.electronAPI.selectBackupDirectory();
    if (selected) {
      await updateSettings.mutateAsync({ backupDirectory: selected });
      toast.success('Backup folder updated');
    }
  };

  const handleOpenFolder = async () => {
    if (!window.electronAPI?.openBackupDirectory) {
      toast.error('Open folder is available in the desktop app');
      return;
    }
    await window.electronAPI.openBackupDirectory(settings.backupDirectory);
  };

  const handleRestoreDatabase = async () => {
    if (!window.electronAPI?.selectBackupFile) {
      toast.error('Backup file selection is available in the desktop app');
      return;
    }

    const selected = await window.electronAPI.selectBackupFile();
    if (!selected) return;

    setIsImportingBackup(true);
    try {
      const importedBackup = await backupApi.importBackupFile(selected);
      toast.success('Backup file imported');
      void listQuery.refetch();
      setRestoreTarget(importedBackup);
    } catch {
      toast.error('Backup import failed');
    } finally {
      setIsImportingBackup(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Backup and Restore</h2>
            <p className="mt-1 text-sm text-slate-500">
              PostgreSQL custom-format backups with verified archives and pre-restore safety backups.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void listQuery.refetch()} className={secondaryButtonClass}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button type="button" onClick={() => void handleOpenFolder()} className={secondaryButtonClass}>
              <FolderOpen className="h-4 w-4" />
              Open folder
            </button>
            <button
              type="button"
              onClick={() => void handleRestoreDatabase()}
              disabled={isImportingBackup}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" />
              {isImportingBackup ? 'Importing backup' : 'Restore database'}
            </button>
            <button
              type="button"
              onClick={() => void handleCreateBackup()}
              disabled={createBackup.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {createBackup.isPending ? 'Creating backup' : 'Create backup now'}
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatusItem label="System status" value={statusQuery.data?.system.status ?? 'NORMAL'} />
          <StatusItem label="Last successful backup" value={formatDateTime(statusQuery.data?.lastSuccessfulBackup?.createdAt)} />
          <StatusItem label="Next scheduled backup" value={formatDateTime(statusQuery.data?.nextScheduledBackup)} />
        </div>
      </div>

      <BackupSettingsForm
        settings={settings}
        isSaving={updateSettings.isPending}
        onSelectFolder={handleSelectFolder}
        onSave={(patch) => updateSettings.mutateAsync(patch)}
      />

      <BackupList backups={listQuery.data?.items ?? []} onRestore={setRestoreTarget} />

      <RestoreBackupDialog
        backup={restoreTarget}
        onClose={() => setRestoreTarget(null)}
        onRestored={() => {
          setRestoreTarget(null);
          void listQuery.refetch();
          void statusQuery.refetch();
        }}
      />
    </section>
  );
};

const BackupSettingsForm: React.FC<{
  settings: BackupSettings;
  isSaving: boolean;
  onSelectFolder: () => void;
  onSave: (patch: Partial<BackupSettings>) => Promise<unknown>;
}> = ({ settings, isSaving, onSelectFolder, onSave }) => {
  const [automaticBackupsEnabled, setAutomaticBackupsEnabled] = useState(settings.automaticBackupsEnabled);
  const [automaticBackupTime, setAutomaticBackupTime] = useState(settings.automaticBackupTime);
  const [automaticRetentionCount, setAutomaticRetentionCount] = useState(settings.automaticRetentionCount);

  const toolsReady = Boolean(settings.discoveredTools?.pgDumpPath && settings.discoveredTools?.pgRestorePath);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_160px_160px_120px]">
        <div>
          <label className="block text-sm font-medium text-slate-700">Backup folder</label>
          <p className="mt-1 break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {settings.backupDirectory}
          </p>
          <button type="button" onClick={onSelectFolder} className={`${secondaryButtonClass} mt-2`}>
            <FolderOpen className="h-4 w-4" />
            Change folder
          </button>
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Daily time
          <input
            type="time"
            value={automaticBackupTime}
            onChange={(event) => setAutomaticBackupTime(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Keep auto backups
          <select
            value={automaticRetentionCount}
            onChange={(event) => setAutomaticRetentionCount(Number(event.target.value))}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {retentionOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={automaticBackupsEnabled}
            onChange={(event) => setAutomaticBackupsEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600"
          />
          Enabled
        </label>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className={`text-sm ${toolsReady ? 'text-emerald-700' : 'text-amber-700'}`}>
          {toolsReady ? 'PostgreSQL backup tools found.' : 'PostgreSQL pg_dump/pg_restore not found.'}
        </div>
        <button
          type="button"
          disabled={isSaving}
          onClick={() =>
            void onSave({ automaticBackupsEnabled, automaticBackupTime, automaticRetentionCount })
          }
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {isSaving ? 'Saving' : 'Save automatic settings'}
        </button>
      </div>
    </div>
  );
};

export const BACKUP_PREVIEW_LIMIT = 5;

export function visibleBackups(backups: BackupRecord[], expanded: boolean): BackupRecord[] {
  return expanded ? backups : backups.slice(0, BACKUP_PREVIEW_LIMIT);
}

export const BackupList: React.FC<{ backups: BackupRecord[]; onRestore: (backup: BackupRecord) => void }> = ({
  backups,
  onRestore,
}) => {
  const [expanded, setExpanded] = useState(false);
  const displayedBackups = visibleBackups(backups, expanded);
  const hasMore = backups.length > BACKUP_PREVIEW_LIMIT;

  return <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Filename</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Size</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Verified</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {backups.length === 0 ? (
            <tr>
              <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>
                No backups found in the configured folder.
              </td>
            </tr>
          ) : (
            displayedBackups.map((backup) => (
              <tr key={backup.id}>
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDateTime(backup.createdAt)}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{backup.filename}</td>
                <td className="px-4 py-3 text-slate-700">{backup.type}</td>
                <td className="px-4 py-3 text-slate-700">{formatBytes(backup.sizeBytes)}</td>
                <td className="px-4 py-3 text-slate-700">{backup.status}</td>
                <td className="px-4 py-3">
                  {backup.verified ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-label="Verified" />
                  ) : (
                    <ShieldAlert className="h-5 w-5 text-amber-600" aria-label="Not verified" />
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={backup.status !== 'COMPLETED'}
                    onClick={() => onRestore(backup)}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-amber-200 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Restore
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
    {hasMore && (
      <div className="flex items-center justify-center border-t border-slate-200 bg-slate-50 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          {expanded
            ? 'Show less / عرض أقل'
            : `Show more (${backups.length - BACKUP_PREVIEW_LIMIT}) / عرض المزيد`}
        </button>
      </div>
    )}
  </div>
};

const RestoreBackupDialog: React.FC<{
  backup: BackupRecord | null;
  onClose: () => void;
  onRestored: () => void;
}> = ({ backup, onClose, onRestored }) => {
  const [validation, setValidation] = useState<RestoreValidationData | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    setValidation(null);
    setConfirmation('');
    setAccountPassword('');
  }, [backup?.id]);

  const handleValidate = async () => {
    if (!backup) return;
    setIsWorking(true);
    try {
      setValidation(await backupApi.validateRestore(backup.id));
    } catch {
      toast.error('Backup validation failed');
    } finally {
      setIsWorking(false);
    }
  };

  const handleRestore = async () => {
    if (!backup || confirmation !== 'RESTORE' || !accountPassword) return;
    setIsWorking(true);
    try {
      const result = await backupApi.restoreBackup(backup.id, 'RESTORE', accountPassword);
      toast.success(result.restartRequired ? 'Restore completed. Restart Home Connects.' : 'Restore completed');
      onRestored();
    } catch {
      toast.error('Restore failed');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <Modal isOpen={Boolean(backup)} onClose={onClose} title="Restore backup" maxWidth="max-w-2xl">
      {backup && (
        <div className="space-y-5">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Current data will be replaced. A verified pre-restore safety backup will be created first.
          </div>
          <div className="text-sm text-slate-700">
            <p className="font-medium text-slate-900">{backup.filename}</p>
            <p>{formatDateTime(backup.createdAt)} · {formatBytes(backup.sizeBytes)}</p>
          </div>
          <button type="button" onClick={() => void handleValidate()} disabled={isWorking} className={secondaryButtonClass}>
            Validate backup
          </button>
          {validation && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p>Archive readable: {validation.archiveReadable ? 'Yes' : 'No'}</p>
              <p>Checksum matches: {validation.checksumMatches ? 'Yes' : 'No'}</p>
              <p>Compatible version: {validation.compatible ? 'Yes' : 'No'}</p>
              {validation.warnings.map((warning) => (
                <p key={warning} className="text-amber-700">{warning}</p>
              ))}
            </div>
          )}
          <label className="block text-sm font-medium text-slate-700">
            Type RESTORE to confirm
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Account password
            <input
              type="password"
              value={accountPassword}
              onChange={(event) => setAccountPassword(event.target.value)}
              autoComplete="current-password"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
            <button
              type="button"
              onClick={() => void handleRestore()}
              disabled={!validation?.archiveReadable || !validation.checksumMatches || !validation.compatible || confirmation !== 'RESTORE' || !accountPassword || isWorking}
              className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Restore database
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

const StatusItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
    <p className="text-sm font-medium text-slate-500">{label}</p>
    <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
  </div>
);

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatBytes(value: number) {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60';
