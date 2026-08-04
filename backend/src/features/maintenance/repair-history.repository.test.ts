import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { RepairHistoryClient, RepairHistoryRepository } from './repair-history.repository';

const MIGRATION = path.resolve(__dirname, '../../../prisma/migrations/20260804130000_add_repair_history/migration.sql');
const SCHEMA = path.resolve(__dirname, '../../../prisma/schema.prisma');

function fakeClient(options: { failWrites?: boolean; rows?: unknown[] } = {}) {
  const executed: Array<{ sql: string; values: unknown[] }> = [];
  const client: RepairHistoryClient = {
    $executeRawUnsafe: async (sql: string, ...values: unknown[]) => {
      if (options.failWrites) throw new Error('database is read-only');
      executed.push({ sql, values });
      return 1;
    },
    $queryRawUnsafe: async (sql: string, ...values: unknown[]) => {
      if (options.failWrites) throw new Error('database is read-only');
      executed.push({ sql, values });
      return (options.rows ?? []) as never;
    },
  };
  return { client, executed };
}

const entry = {
  repairId: 'phase12-partial-migration',
  version: '1.0.5',
  kind: 'REPAIR' as const,
  checksum: 'sha256:abc',
  status: 'APPLIED' as const,
  appliedById: '11111111-1111-4111-8111-111111111111',
  appliedByName: 'Samir',
  backupPath: 'D:/Backups/pre-repair.backup',
  durationMs: 1200,
};

describe('repair history bootstrap', () => {
  it('creates the table and both enums before writing', async () => {
    const { client, executed } = fakeClient();
    await RepairHistoryRepository.ensureTable(client);

    const sql = executed.map((call) => call.sql).join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "repair_history"');
    expect(sql).toContain('CREATE TYPE "RepairKind"');
    expect(sql).toContain('CREATE TYPE "RepairStatus"');
  });

  /** CREATE TYPE has no IF NOT EXISTS, so re-running must not error. */
  it('guards enum creation against already existing', async () => {
    const { client, executed } = fakeClient();
    await RepairHistoryRepository.ensureTable(client);
    expect(executed.map((call) => call.sql).join('\n')).toContain('duplicate_object');
  });

  it('bootstraps before every write, so a database predating the migration still records', async () => {
    const { client, executed } = fakeClient();
    await RepairHistoryRepository.record(client, entry);
    expect(executed[0].sql).toContain('CREATE TYPE');
    expect(executed.at(-1)?.sql).toContain('INSERT INTO "repair_history"');
  });
});

describe('recording an outcome', () => {
  it('passes every field as a bound parameter', async () => {
    const { client, executed } = fakeClient();
    const id = await RepairHistoryRepository.record(client, entry);

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const insert = executed.at(-1)!;
    expect(insert.sql).not.toContain('Samir');
    expect(insert.values).toContain('Samir');
    expect(insert.values).toContain('phase12-partial-migration');
    expect(insert.values).toContain('D:/Backups/pre-repair.backup');
  });

  it('accepts a null user, so an unattended run can still be recorded', async () => {
    const { client, executed } = fakeClient();
    await RepairHistoryRepository.record(client, { ...entry, appliedById: null, appliedByName: 'System' });
    expect(executed.at(-1)!.values).toContain(null);
  });

  it('normalises optional fields to null rather than undefined', async () => {
    const { client, executed } = fakeClient();
    await RepairHistoryRepository.record(client, {
      ...entry, backupPath: undefined, durationMs: undefined, errorMessage: undefined,
    });
    const values = executed.at(-1)!.values;
    expect(values.slice(-3)).toEqual([null, null, null]);
  });

  /**
   * A repair that worked must not be reported as failed because its audit row
   * could not be written.
   */
  it('returns null instead of throwing when the write fails', async () => {
    const { client } = fakeClient({ failWrites: true });
    await expect(RepairHistoryRepository.record(client, entry)).resolves.toBeNull();
  });

  it('records a failure outcome with its message', async () => {
    const { client, executed } = fakeClient();
    await RepairHistoryRepository.record(client, { ...entry, status: 'FAILED', errorMessage: "syntax error at 'x'" });
    expect(executed.at(-1)!.values).toContain("syntax error at 'x'");
  });
});

describe('reading history', () => {
  it('returns rows newest first and clamps the limit', async () => {
    const { client, executed } = fakeClient({ rows: [{ id: 'a' }] });
    await RepairHistoryRepository.list(client, 5000);
    const select = executed.at(-1)!.sql;
    expect(select).toContain('ORDER BY "appliedAt" DESC');
    expect(select).toContain('LIMIT 200');
  });

  it('never interpolates a non-numeric limit', async () => {
    const { client, executed } = fakeClient();
    await RepairHistoryRepository.list(client, Number.NaN);
    expect(executed.at(-1)!.sql).toMatch(/LIMIT \d+$/);
  });

  it('degrades to an empty list rather than throwing', async () => {
    const { client } = fakeClient({ failWrites: true });
    await expect(RepairHistoryRepository.list(client)).resolves.toEqual([]);
  });

  it('reports whether an exact file was already applied', async () => {
    const applied = fakeClient({ rows: [{ count: 1 }] });
    await expect(RepairHistoryRepository.hasApplied(applied.client, 'r', 'sha256:abc')).resolves.toBe(true);

    const never = fakeClient({ rows: [{ count: 0 }] });
    await expect(RepairHistoryRepository.hasApplied(never.client, 'r', 'sha256:abc')).resolves.toBe(false);
  });
});

describe('migration and schema agree with the bootstrap', () => {
  it('ships an additive migration that creates only the new table and enums', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    expect(sql).toContain('CREATE TABLE "repair_history"');
    expect(sql).toContain('CREATE TYPE "RepairKind"');
    expect(sql).toContain('CREATE TYPE "RepairStatus"');
    expect(sql).toContain('REFERENCES "users"("id")');
    // Additive only: nothing existing may be dropped or altered.
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT)/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"(?!repair_history")/i);
  });

  it('keeps the model append-only, with no unique constraint that would reject a repeated outcome', () => {
    const schema = fs.readFileSync(SCHEMA, 'utf8');
    const model = schema.slice(schema.indexOf('model RepairHistory'));
    expect(model.slice(0, model.indexOf('}'))).not.toContain('@@unique');
  });

  it('declares every status the runner can produce', () => {
    const schema = fs.readFileSync(SCHEMA, 'utf8');
    for (const status of ['APPLIED', 'SKIPPED_NOT_NEEDED', 'FAILED', 'BLOCKED_NO_BACKUP', 'VERIFY_FAILED']) {
      expect(schema).toContain(status);
    }
  });
});
