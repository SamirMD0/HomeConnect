export type BackupType = 'MANUAL' | 'AUTO' | 'PRE_RESTORE';
export type BackupStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'DELETED' | 'RESTORED';
export type SystemStatus = 'NORMAL' | 'BACKUP_IN_PROGRESS' | 'RESTORE_IN_PROGRESS' | 'RESTART_REQUIRED' | 'FAILED';

export interface BackupSettings {
  backupDirectory: string;
  automaticBackupsEnabled: boolean;
  automaticBackupTime: string;
  automaticRetentionCount: number;
  pgDumpPath: string | null;
  pgRestorePath: string | null;
  psqlPath: string | null;
  lastAutomaticBackupAt: string | null;
  discoveredTools?: {
    pgDumpPath: string | null;
    pgRestorePath: string | null;
    psqlPath: string | null;
  };
}

export interface BackupRecord {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  type: BackupType;
  status: BackupStatus;
  databaseName: string;
  applicationVersion: string;
  postgresVersion: string | null;
  checksum: string | null;
  verified: boolean;
  createdBy: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  restoredAt?: string | null;
}

export interface BackupStatusData {
  system: {
    status: SystemStatus;
    message: string | null;
  };
  runningOperation: 'BACKUP' | 'RESTORE' | null;
  settings: BackupSettings;
  lastSuccessfulBackup: BackupRecord | null;
  nextScheduledBackup: string | null;
}

export interface BackupListData {
  items: BackupRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface RestoreValidationData {
  backup: BackupRecord;
  checksumMatches: boolean;
  archiveReadable: boolean;
  compatible: boolean;
  warnings: string[];
}

export interface RestoreResultData {
  restoredBackup: BackupRecord;
  preRestoreBackup: BackupRecord;
  restartRequired: boolean;
}

export interface ApiResponse<T> {
  success: true;
  data: T;
}

declare global {
  interface Window {
    electronAPI?: {
      ping?: () => Promise<string>;
      selectBackupDirectory?: () => Promise<string | null>;
      selectBackupFile?: () => Promise<string | null>;
      openBackupDirectory?: (directory: string) => Promise<string>;
      openLogsFolder?: () => Promise<void>;
      copyDiagnostics?: (data: string) => Promise<void>;
      exportLabelsPdf?: (options: { suggestedName: string; paper: 'A4' | 'LETTER' }) => Promise<{ saved: boolean; path?: string; error?: string }>;
    };
  }
}
