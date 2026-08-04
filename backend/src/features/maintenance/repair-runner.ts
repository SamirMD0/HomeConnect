import { LoadedRepair } from './repair-registry';
import {
  RepairHistoryClient,
  RepairHistoryRepository,
  RepairStatus,
} from './repair-history.repository';
import { splitSqlStatements } from './sql-statement-splitter';

/**
 * Applies one repair behind every safety gate the plan requires.
 *
 * The order is the point, and it is deliberately pessimistic:
 *
 *   tools present? → already applied? → BACKUP (verified) → apply in a
 *   transaction → verify the result → record history
 *
 * A repair never runs without a verified backup on disk. If `pg_dump` is
 * missing the repair is refused outright rather than "just this once" — the
 * whole value of the feature is that an operator can undo what it did.
 *
 * Nothing here throws to the caller: every outcome is a recorded status, so a
 * batch reports per-item results instead of dying half-way.
 */

export interface RepairExecutionClient extends RepairHistoryClient {
  $transaction<T>(run: (tx: RepairExecutionClient) => Promise<T>): Promise<T>;
}

/** The backup and locking surface, injected so the pipeline is testable. */
export interface RepairEnvironment {
  /** Resolves false when pg_dump/pg_restore are unavailable. */
  backupToolsAvailable(): Promise<boolean>;
  /** Creates and verifies a PRE_REPAIR backup, returning its absolute path. */
  createPreRepairBackup(actorId: string | null): Promise<{ path: string; verified: boolean }>;
  /** Runs the whole pipeline under the shared BACKUP/RESTORE/REPAIR lock. */
  runExclusive<T>(run: () => Promise<T>): Promise<T>;
  /** Blocks business writes for the duration. */
  enterMaintenance(): void;
  exitMaintenance(): void;
}

export interface RepairActor {
  id: string | null;
  name: string;
}

export interface RepairOutcome {
  repairId: string;
  status: RepairStatus;
  backupPath: string | null;
  durationMs: number;
  message: string;
}

export class RepairRunner {
  static async apply(
    client: RepairExecutionClient,
    repair: LoadedRepair,
    actor: RepairActor,
    environment: RepairEnvironment,
  ): Promise<RepairOutcome> {
    const startedAt = Date.now();
    const record = async (status: RepairStatus, message: string, backupPath: string | null, errorMessage?: string): Promise<RepairOutcome> => {
      const durationMs = Date.now() - startedAt;
      // Awaited, not fire-and-forget: the row must be on disk before the caller
      // is told the repair finished, or a shutdown could lose it. This cannot
      // fail the repair — `record` returns null on error rather than throwing.
      await RepairHistoryRepository.record(client, {
        repairId: repair.entry.repairId,
        version: repair.entry.version,
        kind: 'REPAIR',
        checksum: repair.entry.checksum,
        status,
        appliedById: actor.id,
        appliedByName: actor.name,
        backupPath,
        durationMs,
        errorMessage: errorMessage ?? null,
      });
      return { repairId: repair.entry.repairId, status, backupPath, durationMs, message };
    };

    // Gate 1 — nothing runs without the means to back out of it.
    if (!(await environment.backupToolsAvailable())) {
      return await record('BLOCKED_NO_BACKUP', 'Cannot back up: PostgreSQL tools were not found. Set the pg_dump path in Backup settings.', null);
    }

    // Gate 2 — already applied? Detection, not the filename, decides.
    if (!(await this.isNeeded(client, repair))) {
      return await record('SKIPPED_NOT_NEEDED', 'Already applied — nothing to do.', null);
    }

    return environment.runExclusive(async () => {
      let backupPath: string | null = null;
      environment.enterMaintenance();

      try {
        // Gate 3 — a verified backup, or the repair does not happen.
        try {
          const backup = await environment.createPreRepairBackup(actor.id);
          backupPath = backup.path;
          if (!backup.verified) {
            return await record('BLOCKED_NO_BACKUP', 'The safety backup could not be verified, so no changes were made.', backupPath);
          }
        } catch (error) {
          return await record('BLOCKED_NO_BACKUP', `Backup failed, so no changes were made: ${messageOf(error)}`, null, messageOf(error));
        }

        // Gate 4 — apply and verify inside one transaction. A verification
        // failure throws, which rolls the repair back rather than leaving the
        // database in a state nobody checked.
        try {
          await client.$transaction(async (tx) => {
            for (const statement of splitSqlStatements(repair.sql)) await tx.$executeRawUnsafe(statement);

            const verified = await this.verify(tx, repair);
            if (!verified) throw new VerificationError('Repair applied but verification failed.');
          });
        } catch (error) {
          if (error instanceof VerificationError) {
            return await record('VERIFY_FAILED', `${error.message} The database was rolled back. Send diagnostics.`, backupPath, error.message);
          }
          return await record('FAILED', `The repair failed and was rolled back: ${messageOf(error)}`, backupPath, messageOf(error));
        }

        return await record('APPLIED', 'Repair applied and verified.', backupPath);
      } finally {
        environment.exitMaintenance();
      }
    });
  }

  /** A repair is needed when its detection query returns no rows. */
  static async isNeeded(client: RepairExecutionClient, repair: LoadedRepair): Promise<boolean> {
    try {
      const rows = await client.$queryRawUnsafe<unknown[]>(repair.entry.detectionQuery);
      return Array.isArray(rows) && rows.length === 0;
    } catch {
      // An unreadable database is not proof that a repair is needed; refusing
      // is the safe direction.
      return false;
    }
  }

  private static async verify(client: RepairExecutionClient, repair: LoadedRepair): Promise<boolean> {
    const rows = await client.$queryRawUnsafe<Array<{ count: number | bigint }>>(repair.entry.verificationQuery);
    const count = Number(rows?.[0]?.count ?? 0);
    return count === repair.entry.verificationExpects;
  }
}

/** Distinguishes "the SQL blew up" from "the SQL ran but produced the wrong result". */
class VerificationError extends Error {}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error');
