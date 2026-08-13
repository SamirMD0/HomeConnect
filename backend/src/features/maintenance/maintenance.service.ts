import { prisma } from '../../lib/prisma';
import { verifyAdminPassword } from '../../lib/admin-verification';
import { backupMaintenance } from '../backup/backup-maintenance';
import { BackupOperationLock } from '../backup/backup-operation-lock';
import { BackupService } from '../backup/backup.service';
import { BackupSettingsStore } from '../backup/backup-settings.store';
import { PostgresToolDiscovery } from '../backup/postgres-tools';
import { MigrationExecutor } from './migration-executor';
import { BundledMigration, MigrationRunner } from './migration-runner';
import { classifyPresence, PresenceVerdict, readSchemaObjects } from './migration-presence';
import { RepairHistoryRepository, RepairHistoryRow } from './repair-history.repository';
import { LoadedRepair, RepairRegistry, RepairProblem } from './repair-registry';
import { RepairActor, RepairEnvironment, RepairExecutionClient, RepairOutcome, RepairRunner } from './repair-runner';
import { InventoryService } from '../inventory/inventory.service';
import { MaintenanceStockIntegrity } from '../inventory/inventory.types';

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

/** A pending migration plus the evidence for whether its schema is already there. */
export interface PendingMigrationView {
  name: string;
  state: 'PENDING' | 'FAILED';
  verdict: PresenceVerdict;
  reason: string;
  missing: string[];
  expectedCount: number;
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
  /** Same migrations as `migrations.pending`/`failed`, with presence evidence. */
  pendingMigrations: PendingMigrationView[];
  pendingRepairs: PendingRepairView[];
  registryProblems: RepairProblem[];
  history: RepairHistoryRow[];
  /** Read-only four-state inventory reconciliation; safe while its migration is pending. */
  stockIntegrity: MaintenanceStockIntegrity;
}

export interface ResolveMigrationOutcome {
  name: string;
  status: 'RESOLVED' | 'REFUSED' | 'FAILED';
  message: string;
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
      pendingMigrations: await pendingMigrationViews(migrations.pending, migrations.failed),
      pendingRepairs,
      registryProblems: snapshot.problems,
      history: await RepairHistoryRepository.list(client, 20),
      stockIntegrity: await InventoryService.getMaintenanceStockIntegrity(),
    };
  }

  /**
   * Records migrations as applied **without running their SQL**, for a database
   * whose schema was brought up to date by hand.
   *
   * This is the counterpart to `applyPendingChanges`. On a database repaired
   * manually, `_prisma_migrations` never learned about the work, so every later
   * run of the apply path dies on the first migration re-creating a table that
   * already exists — and because repairs run after migrations, it never reaches
   * them. Resolving clears that history so the normal path works again.
   *
   * No DDL runs, so no backup is taken; the lock is still held so this cannot
   * interleave with a repair. A migration whose objects are demonstrably absent
   * is refused, because resolving it would hide the gap permanently.
   */
  static async resolveMigrations(input: {
    userId: string;
    accountPassword: string;
    migrationNames: string[];
    ipAddress: string | null;
  }): Promise<ResolveMigrationOutcome[]> {
    await verifyAdminPassword(input.userId, input.accountPassword, {
      action: 'RESOLVE_MIGRATION_HISTORY',
      ipAddress: input.ipAddress,
      domainLabel: 'database update history',
    });

    const bundled = MigrationRunner.readBundled();
    const actor: RepairActor = { id: input.userId, name: await actorName(input.userId) };

    return repairEnvironment().runExclusive(async () => {
      const summary = await MigrationExecutor.status(client, bundled);
      const schema = await readSchemaObjects(client);
      const outcomes: ResolveMigrationOutcome[] = [];

      for (const name of input.migrationNames) {
        const migration = bundled.find((entry) => entry.name === name);
        if (!migration) {
          outcomes.push({ name, status: 'REFUSED', message: 'This update is not part of the installed version.' });
          continue;
        }

        const entry = summary.entries.find((candidate) => candidate.name === name);
        if (!entry || (entry.state !== 'PENDING' && entry.state !== 'FAILED')) {
          outcomes.push({ name, status: 'REFUSED', message: `Nothing to resolve: it is already recorded as ${entry?.state ?? 'unknown'}.` });
          continue;
        }

        const presence = classifyPresence(migration, schema);
        if (presence.verdict === 'MISSING') {
          outcomes.push({
            name,
            status: 'REFUSED',
            message: `${presence.reason} Apply it instead of resolving it. Missing: ${presence.missing.join(', ')}.`,
          });
          continue;
        }

        const outcome = await MigrationExecutor.markResolved(client, migration);
        await RepairHistoryRepository.record(client, {
          repairId: migration.name,
          version: APP_VERSION,
          kind: 'MIGRATION',
          checksum: migration.checksum,
          status: outcome.applied ? 'SKIPPED_NOT_NEEDED' : 'FAILED',
          appliedById: actor.id,
          appliedByName: actor.name,
          backupPath: null,
          durationMs: null,
          errorMessage: outcome.error ?? null,
        });

        outcomes.push(outcome.applied
          ? { name, status: 'RESOLVED', message: `Recorded as already applied. ${presence.reason}` }
          : { name, status: 'FAILED', message: `Could not record it: ${outcome.error ?? 'unknown error'}` });
      }

      return outcomes;
    });
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

/**
 * Presence evidence for every pending or failed migration. Read-only, and a
 * failure here must not take the whole overview down with it.
 */
async function pendingMigrationViews(pending: string[], failed: string[]): Promise<PendingMigrationView[]> {
  const names = [...pending, ...failed];
  if (names.length === 0) return [];

  try {
    const bundled = new Map(MigrationRunner.readBundled().map((entry) => [entry.name, entry] as const));
    const schema = await readSchemaObjects(client);

    return names.flatMap((name) => {
      const migration: BundledMigration | undefined = bundled.get(name);
      if (!migration) return [];
      const presence = classifyPresence(migration, schema);
      return [{
        name,
        state: pending.includes(name) ? 'PENDING' as const : 'FAILED' as const,
        verdict: presence.verdict,
        reason: presence.reason,
        missing: presence.missing,
        expectedCount: presence.expected.length,
      }];
    });
  } catch {
    return [];
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
