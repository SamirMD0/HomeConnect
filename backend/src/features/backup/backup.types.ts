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
}

export interface BackupRecord {
  id: string;
  filename: string;
  absolutePath: string;
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

export interface BackupListQuery {
  type?: BackupType;
  status?: BackupStatus;
  page: number;
  limit: number;
  sortOrder: 'ASC' | 'DESC';
}

export interface BackupListResult {
  items: PublicBackupRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type PublicBackupRecord = Omit<BackupRecord, 'absolutePath'>;

export interface RestoreValidationResult {
  backup: PublicBackupRecord;
  checksumMatches: boolean;
  archiveReadable: boolean;
  compatible: boolean;
  warnings: string[];
}

export interface BackupToolPaths {
  pgDumpPath: string | null;
  pgRestorePath: string | null;
  psqlPath: string | null;
}
