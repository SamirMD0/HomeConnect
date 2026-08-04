export type PreflightStatus = 'PASS' | 'WARN' | 'FAIL' | 'SKIPPED';

export interface PreflightCheckResult {
  id: string;
  title: string;
  status: PreflightStatus;
  detail: string;
  /** Empty only when the check passed. */
  fix: string;
}

export interface PreflightReport {
  status: PreflightStatus;
  canStart: boolean;
  checkedAt: string;
  appVersion: string;
  checks: PreflightCheckResult[];
}

export interface PendingRepair {
  repairId: string;
  title: string;
  version: string;
  description: string;
  affectedTables: string[];
  requiresSuperuser: boolean;
}

export interface RepairProblem {
  code: string;
  repairId: string | null;
  file: string | null;
  message: string;
}

export type RepairStatus = 'APPLIED' | 'SKIPPED_NOT_NEEDED' | 'FAILED' | 'BLOCKED_NO_BACKUP' | 'VERIFY_FAILED';

export interface RepairHistoryRow {
  id: string;
  repairId: string;
  version: string;
  kind: 'MIGRATION' | 'REPAIR';
  status: RepairStatus;
  appliedAt: string;
  appliedByName: string;
  backupPath: string | null;
  durationMs: number | null;
  errorMessage: string | null;
}

export interface MaintenanceOverview {
  appVersion: string;
  toolsAvailable: boolean;
  blockedReason: string | null;
  migrations: {
    pending: string[];
    failed: string[];
    mismatched: string[];
    databaseIsNewer: boolean;
  };
  pendingRepairs: PendingRepair[];
  registryProblems: RepairProblem[];
  history: RepairHistoryRow[];
}

export interface RepairOutcome {
  repairId: string;
  status: RepairStatus;
  backupPath: string | null;
  durationMs: number;
  message: string;
}
