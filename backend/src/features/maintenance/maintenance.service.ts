import { prisma } from '../../lib/prisma';
import { verifyAdminPassword } from '../../lib/admin-verification';
import { backupMaintenance } from '../backup/backup-maintenance';
import { BackupOperationLock } from '../backup/backup-operation-lock';
import { BackupService } from '../backup/backup.service';
import { BackupSettingsStore } from '../backup/backup-settings.store';
import { PostgresToolDiscovery } from '../backup/postgres-tools';
import { MigrationExecutor } from './migration-executor';
import { MigrationRunner } from './migration-runner';
import { RepairHistoryRepository, RepairHistoryRow } from './repair-history.repository';
import { LoadedRepair, RepairRegistry, RepairProblem } from './repair-registry';
import { RepairActor, RepairEnvironment, RepairExecutionClient, RepairOutcome, RepairRunner } from './repair-runner';

/**
 * The read model and the apply action behind Settings → Maintenance.
 *
 * Reads are safe at any time. The apply path re-verifies the admin's account
 * password (rate-limited and logged to admin_verification_logs by
 * `verifyAdminPassword`) before anything touches the database.
 */

export interface PendingRepairView {
  repairId: string;
  title: string;
  version: string;
  description: string;
  affectedTables: string[];
  requiresSuperuser: boolean;
}

export interface MaintenanceOverview {
  appVersion: string;
  toolsAvailable: boolean;
  /** Stated whenever repairs are unavailable, so the UI never disables silently. */
  blockedReason: string | null;
  migrations: {
    pending: string[];
    failed: string[];
    mismatched: string[];
    databaseIsNewer: boolean;
  };
  pendingRepairs: PendingRepairView[];
  registryProblems: RepairProblem[];
  history: RepairHistoryRow[];
}

const APP_VERSION = process.env.npm_package_version ?? process.env.APP_VERSION ?? 'unknown';

const client = prisma as unknown as RepairExecutionClient;

export class MaintenanceService {
  static async overview(): Promise<MaintenanceOverview> {
    const snapshot = RepairRegistry.load();
    const toolsAvailable = await backupToolsAvailable();

    const migrations = await safeMigrationStatus();
    const pendingRepairs: PendingRepairView[] = [];
    for (const repair of snapshot.repairs) {
      if (await RepairRunner.isNeeded(client, repair)) pendingRepairs.push(toView(repair));
    }

    return {
      appVersion: APP_VERSION,
      toolsAvailable,
      blockedReason: toolsAvailable
        ? null
        : 'Cannot back up: PostgreSQL tools were not found. Set the pg_dump path in Settings → Backup. Repairs stay disabled until a backup is possible.',
      migrations,
      pendingRepairs,
      registryProblems: snapshot.problems,
      history: await RepairHistoryRepository.list(client, 20),
    };
  }

  /**
   * Applies everything the database is missing: pending migrations first, then
   * repairs. Migrations lead because a repair may depend on a table a migration
   * creates.
   *
   * One admin verification, one lock, **one backup** covering the whole run —
   * the repairs are handed a nested environment so `RepairRunner` does not try
   * to take the lock again or duplicate the backup.
   *
   * Stops at the first failure: later work may assume earlier work landed, so
   * continuing would compound the problem rather than fix it.
   */
  static async applyPendingChanges(input: {
    userId: string;
    accountPassword: string;
    ipAddress: string | null;
  }): Promise<RepairOutcome[]> {
    await verifyAdminPassword(input.userId, input.accountPassword, {
      action: 'APPLY_DATABASE_CHANGES',
      ipAddress: input.ipAddress,
      domainLabel: 'database updates and repairs',
    });

    const environment = repairEnvironment();
    const actor: RepairActor = { id: input.userId, name: await actorName(input.userId) };

    if (!(await environment.backupToolsAvailable())) {
      return [{
        repairId: 'backup-tools',
        status: 'BLOCKED_NO_BACKUP',
        backupPath: null,
        durationMs: 0,
        message: 'Cannot back up: PostgreSQL tools were not found. Set the pg_dump path in Settings → Backup.',
      }];
    }

    const bundled = MigrationRunner.readBundled();
    const snapshot = RepairRegistry.load();

    return environment.runExclusive(async () => {
      environment.enterMaintenance();
      const outcomes: RepairOutcome[] = [];
      try {
        let backupPath: string | null = null;
        try {
          const backup = await environment.createPreRepairBackup(actor.id);
          backupPath = backup.path;
          if (!backup.verified) {
            return [blocked('The safety backup could not be verified, so no changes were made.', backupPath)];
          }
        } catch (error) {
          return [blocked(`Backup failed, so no changes were made: ${message(error)}`, null)];
        }

        // ---- migrations ----
        for (const outcome of await MigrationExecutor.applyPending(client, bundled)) {
          const status = outcome.applied ? 'APPLIED' : 'FAILED';
          await RepairHistoryRepository.record(client, {
            repairId: outcome.name,
            version: APP_VERSION,
            kind: 'MIGRATION',
            checksum: bundled.find((entry) => entry.name === outcome.name)?.checksum ?? '',
            status,
            appliedById: actor.id,
            appliedByName: actor.name,
            backupPath,
            durationMs: null,
            errorMessage: outcome.error ?? null,
          });
          outcomes.push({
            repairId: outcome.name,
            status,
            backupPath,
            durationMs: 0,
            message: outcome.applied
              ? 'Database update applied.'
              : `Update failed and was rolled back: ${outcome.error ?? 'unknown error'}`,
          });
          if (!outcome.applied) return outcomes;
        }

        // ---- repairs, inside the lock and backup already taken ----
        const nested = nestedEnvironment(environment, backupPath);
        for (const repair of snapshot.repairs) {
          const outcome = await RepairRunner.apply(client, repair, actor, nested);
          if (outcome.status === 'SKIPPED_NOT_NEEDED') continue;
          outcomes.push(outcome);
          if (outcome.status !== 'APPLIED') break;
        }

        return outcomes;
      } finally {
        environment.exitMaintenance();
      }
    });
  }
}

/**
 * Reuses the lock, backup and maintenance state already established by the
 * caller. Without this, `RepairRunner` would deadlock against the lock the
 * batch is holding and take a second backup per repair.
 */
function nestedEnvironment(environment: RepairEnvironment, backupPath: string | null): RepairEnvironment {
  return {
    backupToolsAvailable: environment.backupToolsAvailable,
    createPreRepairBackup: async () => ({ path: backupPath ?? '', verified: true }),
    runExclusive: (run) => run(),
    enterMaintenance: () => undefined,
    exitMaintenance: () => undefined,
  };
}

const blocked = (message: string, backupPath: string | null): RepairOutcome =>
  ({ repairId: 'pre-repair-backup', status: 'BLOCKED_NO_BACKUP', backupPath, durationMs: 0, message });

const message = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error');

/** Binds the runner's injected surface to the real backup stack. */
export function repairEnvironment(): RepairEnvironment {
  return {
    backupToolsAvailable,
    createPreRepairBackup: async (actorId) => {
      const record = await BackupService.createPreRepairBackup(actorId);
      return { path: record.absolutePath ?? record.filename, verified: Boolean(record.verified) };
    },
    // One lock covers backup, restore and repair so they can never overlap.
    runExclusive: (run) => BackupOperationLock.runExclusive('REPAIR', run),
    enterMaintenance: () => backupMaintenance.enter('REPAIR_IN_PROGRESS', 'Database repair is running'),
    exitMaintenance: () => backupMaintenance.exit(),
  };
}

/** History records who applied a repair by name, which the JWT does not carry. */
async function actorName(userId: string): Promise<string> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, username: true } });
    return user?.fullName || user?.username || 'Administrator';
  } catch {
    return 'Administrator';
  }
}

async function backupToolsAvailable(): Promise<boolean> {
  try {
    const tools = PostgresToolDiscovery.discover(await BackupSettingsStore.load());
    return Boolean(tools.pgDumpPath && tools.pgRestorePath);
  } catch {
    return false;
  }
}

/** Migration status needs the database; an unreachable one is reported empty, not thrown. */
async function safeMigrationStatus() {
  try {
    const summary = await MigrationExecutor.status(client, MigrationRunner.readBundled());
    return {
      pending: summary.pending,
      failed: summary.failed,
      mismatched: summary.mismatched,
      databaseIsNewer: summary.databaseIsNewer,
    };
  } catch {
    return { pending: [], failed: [], mismatched: [], databaseIsNewer: false };
  }
}

const toView = (repair: LoadedRepair): PendingRepairView => ({
  repairId: repair.entry.repairId,
  title: repair.entry.title,
  version: repair.entry.version,
  description: repair.entry.description,
  affectedTables: repair.entry.affectedTables,
  requiresSuperuser: repair.entry.requiresSuperuser,
});
