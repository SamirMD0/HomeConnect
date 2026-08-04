import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { MigrationExecutor, MigrationClient } from './migration-executor';
import {
  BundledMigration,
  checksumOf,
  classifyMigrations,
  MigrationRunner,
  MigrationStatusSummary,
  PrismaMigrationRow,
  planApply,
} from './migration-runner';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../prisma/migrations');

const migrationOf = (name: string, sql = 'SELECT 1;'): BundledMigration =>
  ({ name, sql, checksum: checksumOf(sql) });

const rowOf = (overrides: Partial<PrismaMigrationRow> & { migration_name: string }): PrismaMigrationRow => ({
  checksum: checksumOf('SELECT 1;'),
  finished_at: new Date('2026-07-01T00:00:00Z'),
  rolled_back_at: null,
  applied_steps_count: 1,
  ...overrides,
});

describe('migration checksum compatibility with the Prisma CLI', () => {
  /**
   * The single most load-bearing assertion in this feature. If the runner's
   * checksum ever stops matching the CLI's, the two disagree about what has
   * been applied and the bookkeeping silently rots.
   */
  it('reproduces the checksum the CLI stored for a real migration', () => {
    const file = path.join(MIGRATIONS_DIR, '20260727130000_add_financial_correction_audit/migration.sql');
    expect(checksumOf(fs.readFileSync(file))).toMatch(/^6c14f45b12a5cf6f/);
  });

  it('hashes raw bytes, so a CRLF rewrite would be a different migration', () => {
    // Why .gitattributes pins *.sql to LF: this difference is not cosmetic.
    expect(checksumOf('A;\nB;\n')).not.toBe(checksumOf('A;\r\nB;\r\n'));
  });

  it('reads every bundled migration from the repo', () => {
    const bundled = MigrationRunner.readBundled(MIGRATIONS_DIR);
    expect(bundled.length).toBeGreaterThanOrEqual(19);
    expect(bundled.every((migration) => migration.checksum.length === 64)).toBe(true);
    // Lexical order on a timestamp prefix is chronological order.
    expect([...bundled.map((m) => m.name)]).toEqual([...bundled.map((m) => m.name)].sort());
  });

  it('ignores folders that are not migrations', () => {
    expect(MigrationRunner.readBundled(MIGRATIONS_DIR).some((m) => m.name === 'migration_lock.toml')).toBe(false);
  });
});

describe('migration classification', () => {
  const bundled = [migrationOf('20260101000000_one'), migrationOf('20260102000000_two')];

  it('treats an unrecorded migration as pending', () => {
    expect(classifyMigrations(bundled, []).pending).toEqual(['20260101000000_one', '20260102000000_two']);
  });

  it('treats a finished, matching migration as applied', () => {
    const summary = classifyMigrations(bundled, [rowOf({ migration_name: '20260101000000_one' })]);
    expect(summary.entries[0].state).toBe('APPLIED');
    expect(summary.pending).toEqual(['20260102000000_two']);
  });

  it('treats a started-but-unfinished row as failed — the state that bricks the app', () => {
    const summary = classifyMigrations(bundled, [rowOf({ migration_name: '20260101000000_one', finished_at: null })]);
    expect(summary.failed).toEqual(['20260101000000_one']);
  });

  it('treats a rolled-back row as pending, so it can be retried', () => {
    const summary = classifyMigrations(bundled, [
      rowOf({ migration_name: '20260101000000_one', finished_at: null, rolled_back_at: new Date() }),
    ]);
    expect(summary.pending).toContain('20260101000000_one');
    expect(summary.failed).toEqual([]);
  });

  it('flags a checksum mismatch rather than silently reapplying', () => {
    const summary = classifyMigrations(bundled, [rowOf({ migration_name: '20260101000000_one', checksum: 'different' })]);
    expect(summary.mismatched).toEqual(['20260101000000_one']);
    expect(summary.pending).not.toContain('20260101000000_one');
  });

  it('detects a database newer than the app', () => {
    const summary = classifyMigrations(bundled, [rowOf({ migration_name: '20270101000000_from_the_future' })]);
    expect(summary.databaseIsNewer).toBe(true);
    expect(summary.unknownInDatabase).toEqual(['20270101000000_from_the_future']);
  });

  it('does not count a rolled-back unknown row as the database being newer', () => {
    const summary = classifyMigrations(bundled, [
      rowOf({ migration_name: '20270101000000_from_the_future', rolled_back_at: new Date() }),
    ]);
    expect(summary.databaseIsNewer).toBe(false);
  });
});

describe('apply plan', () => {
  const migration = migrationOf('20260101000000_one', 'CREATE TABLE "a" ("id" INT);\nCREATE TABLE "b" ("id" INT);');

  it('runs the statements then records the bookkeeping row last', () => {
    const plan = planApply(migration, null);
    expect(plan).toHaveLength(3);
    expect(plan[0]).toContain('CREATE TABLE "a"');
    expect(plan[1]).toContain('CREATE TABLE "b"');
    expect(plan[2]).toContain('INSERT INTO "_prisma_migrations"');
    expect(plan[2]).toContain(migration.checksum);
    expect(plan[2]).toContain('20260101000000_one');
  });

  it('closes out a failed row before retrying, and only then', () => {
    const recovery = planApply(migration, { name: migration.name, state: 'FAILED', checksum: null, appliedAt: null });
    expect(recovery[0]).toContain('SET "rolled_back_at" = now()');
    expect(recovery[0]).toContain('"finished_at" IS NULL');
    expect(recovery).toHaveLength(4);

    expect(planApply(migration, { name: migration.name, state: 'PENDING', checksum: null, appliedAt: null })[0])
      .not.toContain('rolled_back_at');
  });

  it('keeps a DO block whole rather than splitting on its inner semicolons', () => {
    const doBlock = migrationOf('20260101000000_do', `DO $$ BEGIN CREATE TYPE "t" AS ENUM ('A'); END $$;`);
    const plan = planApply(doBlock, null);
    expect(plan).toHaveLength(2);
    expect(plan[0]).toContain('END $$');
  });

  it('escapes quotes so a name cannot break the bookkeeping statement', () => {
    const odd = migrationOf("20260101000000_o'brien");
    expect(planApply(odd, null).at(-1)).toContain("o''brien");
  });
});

/** A fake client — the real apply path is rehearsed on a scratch database, never the business one. */
function fakeClient(failOn?: RegExp) {
  const executed: string[] = [];
  let transactions = 0;
  const client: MigrationClient = {
    $queryRawUnsafe: async () => [] as never,
    $executeRawUnsafe: async (sql: string) => {
      if (failOn?.test(sql)) throw new Error('boom');
      executed.push(sql);
      return 1;
    },
    $transaction: async (run) => { transactions += 1; return run(client); },
  };
  return { client, executed, transactionCount: () => transactions };
}

const summaryFor = (state: 'PENDING' | 'FAILED', name: string): MigrationStatusSummary => ({
  entries: [{ name, state, checksum: null, appliedAt: null }],
  pending: state === 'PENDING' ? [name] : [],
  failed: state === 'FAILED' ? [name] : [],
  mismatched: [],
  unknownInDatabase: [],
  databaseIsNewer: false,
});

describe('migration executor', () => {
  const migration = migrationOf('20260101000000_one', 'CREATE TABLE "a" ("id" INT);');

  it('applies every statement inside one transaction', async () => {
    const { client, executed, transactionCount } = fakeClient();
    const outcome = await MigrationExecutor.applyOne(client, migration, summaryFor('PENDING', migration.name));

    expect(outcome.applied).toBe(true);
    expect(transactionCount()).toBe(1);
    expect(executed.at(-1)).toContain('INSERT INTO "_prisma_migrations"');
  });

  it('reports a failure without throwing, so one bad migration does not crash the app', async () => {
    const { client } = fakeClient(/CREATE TABLE/);
    const outcome = await MigrationExecutor.applyOne(client, migration, summaryFor('PENDING', migration.name));

    expect(outcome.applied).toBe(false);
    expect(outcome.error).toContain('boom');
  });

  it('marks a recovery so the operator knows a half-applied row was closed out', async () => {
    const { client, executed } = fakeClient();
    const outcome = await MigrationExecutor.applyOne(client, migration, summaryFor('FAILED', migration.name));

    expect(outcome.recovered).toBe(true);
    expect(executed[0]).toContain('rolled_back_at');
  });

  /**
   * Proved necessary by the CP11 rehearsal: re-running a half-applied Prisma
   * migration dies on `42710: type already exists`, so recovery has to be
   * "apply the matching repair, then record the migration as resolved".
   */
  it('records a migration as resolved without executing its SQL', async () => {
    const { client, executed } = fakeClient();
    const outcome = await MigrationExecutor.markResolved(client, migration);

    expect(outcome.applied).toBe(true);
    expect(outcome.recovered).toBe(true);
    expect(executed.join('\n')).not.toContain('CREATE TABLE "a"');
    expect(executed[0]).toContain('rolled_back_at');
    expect(executed.at(-1)).toContain('INSERT INTO "_prisma_migrations"');
    expect(executed.at(-1)).toContain(migration.checksum);
  });

  it('creates the bookkeeping table for a database that predates Prisma', async () => {
    const { client, executed } = fakeClient();
    await MigrationExecutor.ensureBookkeepingTable(client);
    expect(executed[0]).toContain('CREATE TABLE IF NOT EXISTS "_prisma_migrations"');
  });
});
