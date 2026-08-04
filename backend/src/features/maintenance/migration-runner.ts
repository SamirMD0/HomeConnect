import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { splitSqlStatements } from './sql-statement-splitter';

/**
 * Applies bundled Prisma migrations without the Prisma CLI, which is not
 * installed on a business PC.
 *
 * The bookkeeping must be *byte-identical* to what `prisma migrate deploy`
 * writes, or the two tools stop agreeing about what has been applied. The
 * checksum is a plain SHA-256 of the raw `migration.sql` bytes — verified
 * against a real row: `20260727130000_add_financial_correction_audit` hashes to
 * `6c14f45b12a5cf6f…`, exactly the value the CLI stored.
 *
 * That byte-for-byte dependency is also why `.gitattributes` pins `*.sql` to
 * LF. A CRLF checkout would change every hash and make correct files look
 * tampered with.
 */

export type MigrationState =
  /** Recorded as finished and the checksum agrees. Nothing to do. */
  | 'APPLIED'
  /** Never recorded, or recorded and then rolled back. Safe to apply. */
  | 'PENDING'
  /** Started and never finished — the half-applied state that bricks the app. */
  | 'FAILED'
  /** Recorded as applied but the bundled file no longer hashes the same. */
  | 'CHECKSUM_MISMATCH'
  /** In the database but not in this build: the database is newer than the app. */
  | 'UNKNOWN_IN_DB';

export interface BundledMigration {
  name: string;
  sql: string;
  checksum: string;
}

/** Shape of a `_prisma_migrations` row, using Prisma's own column names. */
export interface PrismaMigrationRow {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  applied_steps_count: number;
}

export interface MigrationStatusEntry {
  name: string;
  state: MigrationState;
  checksum: string | null;
  appliedAt: Date | null;
}

export interface MigrationStatusSummary {
  entries: MigrationStatusEntry[];
  pending: string[];
  failed: string[];
  mismatched: string[];
  unknownInDatabase: string[];
  /** True when the database carries migrations this build does not know about. */
  databaseIsNewer: boolean;
}

/** Prisma's own DDL, copied from the house repair file so the shapes cannot drift. */
export const PRISMA_MIGRATIONS_DDL = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
)`.trim();

const MIGRATION_FOLDER = /^\d{14}_/;

export class MigrationRunner {
  /** Packaged builds get this from `extraResources`; development reads the repo. */
  static resolveDirectory(): string {
    const candidates = [
      process.env.HOME_CONNECT_MIGRATIONS_DIR,
      process.resourcesPath ? path.join(process.resourcesPath, 'prisma/migrations') : undefined,
      path.resolve(__dirname, '../../../prisma/migrations'),
      path.resolve(process.cwd(), 'backend/prisma/migrations'),
    ].filter((candidate): candidate is string => Boolean(candidate));

    return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[candidates.length - 1];
  }

  /** Reads every bundled migration in lexical order, which for timestamps is chronological. */
  static readBundled(directory = MigrationRunner.resolveDirectory()): BundledMigration[] {
    if (!fs.existsSync(directory)) return [];

    return fs.readdirSync(directory)
      .filter((name) => MIGRATION_FOLDER.test(name))
      .sort()
      .flatMap((name) => {
        const file = path.join(directory, name, 'migration.sql');
        if (!fs.existsSync(file)) return [];
        const bytes = fs.readFileSync(file);
        return [{ name, sql: bytes.toString('utf8'), checksum: checksumOf(bytes) }];
      });
  }
}

/** Prisma's checksum: SHA-256 hex of the raw file bytes. */
export function checksumOf(bytes: Buffer | string): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/**
 * Pure classification, so every state can be tested without a database.
 *
 * A row that was rolled back counts as PENDING rather than FAILED: rolling back
 * is how the runner records "this one did not take, try again", and the repair
 * files are idempotent precisely so that retry is safe.
 */
export function classifyMigrations(bundled: BundledMigration[], rows: PrismaMigrationRow[]): MigrationStatusSummary {
  const byName = new Map(rows.map((row) => [row.migration_name, row]));

  const entries: MigrationStatusEntry[] = bundled.map((migration) => {
    const row = byName.get(migration.name);
    if (!row) return { name: migration.name, state: 'PENDING', checksum: migration.checksum, appliedAt: null };
    if (row.rolled_back_at) return { name: migration.name, state: 'PENDING', checksum: migration.checksum, appliedAt: null };
    if (!row.finished_at) return { name: migration.name, state: 'FAILED', checksum: migration.checksum, appliedAt: null };
    if (row.checksum !== migration.checksum) {
      return { name: migration.name, state: 'CHECKSUM_MISMATCH', checksum: migration.checksum, appliedAt: row.finished_at };
    }
    return { name: migration.name, state: 'APPLIED', checksum: migration.checksum, appliedAt: row.finished_at };
  });

  const bundledNames = new Set(bundled.map((migration) => migration.name));
  const unknownInDatabase = rows
    .filter((row) => !bundledNames.has(row.migration_name) && row.finished_at && !row.rolled_back_at)
    .map((row) => row.migration_name);

  for (const name of unknownInDatabase) {
    entries.push({ name, state: 'UNKNOWN_IN_DB', checksum: null, appliedAt: byName.get(name)?.finished_at ?? null });
  }

  const named = (state: MigrationState) => entries.filter((entry) => entry.state === state).map((entry) => entry.name);

  return {
    entries,
    pending: named('PENDING'),
    failed: named('FAILED'),
    mismatched: named('CHECKSUM_MISMATCH'),
    unknownInDatabase,
    databaseIsNewer: unknownInDatabase.length > 0,
  };
}

/**
 * The exact statement sequence for applying one migration.
 *
 * Returned as data rather than executed here, so the ordering — the part that
 * must not be got wrong — is unit-testable without a database.
 *
 * Recovery is included in the same list, and therefore the same transaction: if
 * the migration fails, the `rolled_back_at` marking rolls back with it and the
 * database is left exactly as it was. PostgreSQL DDL is transactional, so a
 * mid-file failure cannot leave a half-applied state.
 */
export function planApply(migration: BundledMigration, previous: MigrationStatusEntry | null): string[] {
  const statements: string[] = [];

  if (previous?.state === 'FAILED') {
    // Do not blindly retry a half-applied row: close it out first, exactly as
    // the recovery was performed by hand on 2026-07-28.
    statements.push(
      `UPDATE "_prisma_migrations" SET "rolled_back_at" = now() ` +
      `WHERE "migration_name" = '${escapeLiteral(migration.name)}' AND "finished_at" IS NULL`
    );
  }

  statements.push(...splitSqlStatements(migration.sql));

  statements.push(
    `INSERT INTO "_prisma_migrations" ` +
    `("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count") ` +
    `VALUES ('${crypto.randomUUID()}', '${escapeLiteral(migration.checksum)}', now(), ` +
    `'${escapeLiteral(migration.name)}', NULL, NULL, now(), 1)`
  );

  return statements;
}

/**
 * Records a migration as applied **without running its SQL** — the equivalent of
 * `prisma migrate resolve --applied`.
 *
 * This exists because of what the CP11 scratch-database rehearsal proved:
 * §6 said failed-row recovery could "run the file (repairs are written
 * idempotently)", but that parenthetical is only true of repairs. *Prisma
 * migration* SQL is not idempotent — re-running a half-applied one dies on
 * `42710: type already exists`, which is exactly the failure this feature was
 * built to escape.
 *
 * So the real recovery is the one that was performed by hand on 2026-07-28:
 * apply the matching idempotent repair from `backend/prisma/repair/`, then mark
 * the migration resolved with this.
 */
export function planResolve(migration: BundledMigration): string[] {
  return [
    `UPDATE "_prisma_migrations" SET "rolled_back_at" = now() ` +
    `WHERE "migration_name" = '${escapeLiteral(migration.name)}' AND "finished_at" IS NULL`,

    `INSERT INTO "_prisma_migrations" ` +
    `("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count") ` +
    `VALUES ('${crypto.randomUUID()}', '${escapeLiteral(migration.checksum)}', now(), ` +
    `'${escapeLiteral(migration.name)}', 'Resolved after applying the matching repair.', NULL, now(), 1)`,
  ];
}

/**
 * Migration names and checksums are read from the filesystem, not from user
 * input, but they are still interpolated into SQL — so they are escaped rather
 * than trusted. A folder named with an apostrophe would otherwise break the
 * bookkeeping statement.
 */
function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}
