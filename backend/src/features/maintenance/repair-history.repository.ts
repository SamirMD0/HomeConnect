import crypto from 'crypto';

/**
 * Append-only record of every migration and repair applied to this database.
 *
 * Deliberately raw SQL rather than the generated Prisma client. The chicken-and-egg
 * is real: this table is written by the very runner that brings an out-of-date
 * database up to date, so it must work on a database that predates its own
 * migration. `ensureTable()` bootstraps with CREATE TABLE IF NOT EXISTS, and the
 * Prisma model in schema.prisma keeps the dev schema truthful.
 *
 * Writes never throw. Losing the audit row is bad; failing an otherwise
 * successful repair *because* the audit row could not be written is worse, and
 * would leave the operator with a database that is fixed but reported as broken.
 */

export type RepairKind = 'MIGRATION' | 'REPAIR';
export type RepairStatus = 'APPLIED' | 'SKIPPED_NOT_NEEDED' | 'FAILED' | 'BLOCKED_NO_BACKUP' | 'VERIFY_FAILED';

export interface RepairHistoryClient {
  $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<number>;
  $queryRawUnsafe<T = unknown>(sql: string, ...values: unknown[]): Promise<T>;
}

export interface RepairHistoryRecord {
  repairId: string;
  version: string;
  kind: RepairKind;
  checksum: string;
  status: RepairStatus;
  appliedById: string | null;
  appliedByName: string;
  backupPath?: string | null;
  durationMs?: number | null;
  errorMessage?: string | null;
}

export interface RepairHistoryRow extends RepairHistoryRecord {
  id: string;
  appliedAt: Date;
}

/**
 * Mirrors migration 20260804130000_add_repair_history. Enum creation is wrapped
 * because CREATE TYPE has no IF NOT EXISTS in PostgreSQL, and this runs on
 * databases that may already have them.
 */
const BOOTSTRAP_SQL = [
  `DO $$ BEGIN
     CREATE TYPE "RepairKind" AS ENUM ('MIGRATION', 'REPAIR');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "RepairStatus" AS ENUM ('APPLIED', 'SKIPPED_NOT_NEEDED', 'FAILED', 'BLOCKED_NO_BACKUP', 'VERIFY_FAILED');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "repair_history" (
     "id" UUID NOT NULL,
     "repairId" TEXT NOT NULL,
     "version" TEXT NOT NULL,
     "kind" "RepairKind" NOT NULL,
     "checksum" TEXT NOT NULL,
     "status" "RepairStatus" NOT NULL,
     "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "appliedById" UUID,
     "appliedByName" TEXT NOT NULL,
     "backupPath" TEXT,
     "durationMs" INTEGER,
     "errorMessage" TEXT,
     CONSTRAINT "repair_history_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE INDEX IF NOT EXISTS "repair_history_appliedAt_idx" ON "repair_history"("appliedAt")`,
  `CREATE INDEX IF NOT EXISTS "repair_history_repairId_appliedAt_idx" ON "repair_history"("repairId", "appliedAt")`,
];

export class RepairHistoryRepository {
  static async ensureTable(client: RepairHistoryClient): Promise<void> {
    for (const statement of BOOTSTRAP_SQL) await client.$executeRawUnsafe(statement);
  }

  /**
   * Records one outcome. Returns the row id, or null when the write failed —
   * callers report that as a warning rather than failing the repair.
   */
  static async record(client: RepairHistoryClient, entry: RepairHistoryRecord): Promise<string | null> {
    const id = crypto.randomUUID();
    try {
      await this.ensureTable(client);
      // Parameterised: errorMessage carries database text that may contain quotes.
      await client.$executeRawUnsafe(
        `INSERT INTO "repair_history"
           ("id", "repairId", "version", "kind", "checksum", "status",
            "appliedById", "appliedByName", "backupPath", "durationMs", "errorMessage")
         VALUES ($1, $2, $3, $4::"RepairKind", $5, $6::"RepairStatus", $7::uuid, $8, $9, $10, $11)`,
        id,
        entry.repairId,
        entry.version,
        entry.kind,
        entry.checksum,
        entry.status,
        entry.appliedById,
        entry.appliedByName,
        entry.backupPath ?? null,
        entry.durationMs ?? null,
        entry.errorMessage ?? null,
      );
      return id;
    } catch {
      return null;
    }
  }

  /** Most recent first. Used by the Maintenance history table. */
  static async list(client: RepairHistoryClient, limit = 20): Promise<RepairHistoryRow[]> {
    try {
      await this.ensureTable(client);
      // NaN survives Math.min/max, which would emit `LIMIT NaN` — a syntax
      // error. The limit is interpolated (bind parameters are not allowed in
      // LIMIT on every driver), so it must be provably a number.
      const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 20;
      return await client.$queryRawUnsafe<RepairHistoryRow[]>(
        `SELECT "id", "repairId", "version", "kind", "checksum", "status", "appliedAt",
                "appliedById", "appliedByName", "backupPath", "durationMs", "errorMessage"
         FROM "repair_history" ORDER BY "appliedAt" DESC LIMIT ${safeLimit}`
      );
    } catch {
      return [];
    }
  }

  /** True when this exact file has already been applied successfully. */
  static async hasApplied(client: RepairHistoryClient, repairId: string, checksum: string): Promise<boolean> {
    try {
      await this.ensureTable(client);
      const rows = await client.$queryRawUnsafe<Array<{ count: number }>>(
        `SELECT count(*)::int AS count FROM "repair_history"
         WHERE "repairId" = $1 AND "checksum" = $2 AND "status" = 'APPLIED'`,
        repairId,
        checksum,
      );
      return Number(rows[0]?.count ?? 0) > 0;
    } catch {
      return false;
    }
  }
}
