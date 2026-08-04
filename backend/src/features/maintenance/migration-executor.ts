import {
  BundledMigration,
  classifyMigrations,
  MigrationRunner,
  MigrationStatusSummary,
  PRISMA_MIGRATIONS_DDL,
  PrismaMigrationRow,
  planApply,
  planResolve,
} from './migration-runner';

/**
 * Executes migration plans against a database.
 *
 * Split from `migration-runner.ts` on purpose: that module decides *what* to
 * run and is pure; this one only carries it out. The client is injected so a
 * scratch database — never the business database — can be used in tests.
 */

/** The slice of the Prisma client this needs, so tests can supply a fake. */
export interface MigrationClient {
  $queryRawUnsafe<T = unknown>(sql: string): Promise<T>;
  $executeRawUnsafe(sql: string): Promise<number>;
  $transaction<T>(run: (tx: MigrationClient) => Promise<T>): Promise<T>;
}

export interface ApplyOutcome {
  name: string;
  applied: boolean;
  recovered: boolean;
  statementCount: number;
  error?: string;
}

export class MigrationExecutor {
  /** Creates `_prisma_migrations` when the database predates any Prisma run. */
  static async ensureBookkeepingTable(client: MigrationClient): Promise<void> {
    await client.$executeRawUnsafe(PRISMA_MIGRATIONS_DDL);
  }

  static async readRows(client: MigrationClient): Promise<PrismaMigrationRow[]> {
    return client.$queryRawUnsafe<PrismaMigrationRow[]>(
      `SELECT "migration_name", "checksum", "finished_at", "rolled_back_at", "applied_steps_count"
       FROM "_prisma_migrations" ORDER BY "started_at" ASC`
    );
  }

  static async status(client: MigrationClient, bundled = MigrationRunner.readBundled()): Promise<MigrationStatusSummary> {
    await this.ensureBookkeepingTable(client);
    return classifyMigrations(bundled, await this.readRows(client));
  }

  /**
   * Applies one migration inside a single transaction, together with its
   * bookkeeping row and any failed-row recovery. If anything throws, the whole
   * thing rolls back and the database is untouched.
   */
  static async applyOne(client: MigrationClient, migration: BundledMigration, summary: MigrationStatusSummary): Promise<ApplyOutcome> {
    const previous = summary.entries.find((entry) => entry.name === migration.name) ?? null;
    const recovered = previous?.state === 'FAILED';
    const statements = planApply(migration, previous);

    try {
      await client.$transaction(async (tx) => {
        for (const statement of statements) await tx.$executeRawUnsafe(statement);
      });
      return { name: migration.name, applied: true, recovered, statementCount: statements.length };
    } catch (error) {
      return {
        name: migration.name,
        applied: false,
        recovered,
        statementCount: statements.length,
        error: error instanceof Error ? error.message : 'Migration failed.',
      };
    }
  }

  /**
   * Marks a migration as applied without running its SQL, for use *after* its
   * matching repair has been applied. See `planResolve` for why re-running a
   * half-applied Prisma migration cannot work.
   */
  static async markResolved(client: MigrationClient, migration: BundledMigration): Promise<ApplyOutcome> {
    const statements = planResolve(migration);
    try {
      await client.$transaction(async (tx) => {
        for (const statement of statements) await tx.$executeRawUnsafe(statement);
      });
      return { name: migration.name, applied: true, recovered: true, statementCount: statements.length };
    } catch (error) {
      return {
        name: migration.name,
        applied: false,
        recovered: true,
        statementCount: statements.length,
        error: error instanceof Error ? error.message : 'Could not record the migration as resolved.',
      };
    }
  }

  /**
   * Applies every pending or failed migration in order, stopping at the first
   * failure. Continuing past one would apply a later migration on top of a
   * database that never got the earlier one.
   */
  static async applyPending(client: MigrationClient, bundled = MigrationRunner.readBundled()): Promise<ApplyOutcome[]> {
    let summary = await this.status(client, bundled);
    const outcomes: ApplyOutcome[] = [];

    for (const migration of bundled) {
      const entry = summary.entries.find((candidate) => candidate.name === migration.name);
      if (!entry || (entry.state !== 'PENDING' && entry.state !== 'FAILED')) continue;

      const outcome = await this.applyOne(client, migration, summary);
      outcomes.push(outcome);
      if (!outcome.applied) break;

      summary = await this.status(client, bundled);
    }

    return outcomes;
  }
}
