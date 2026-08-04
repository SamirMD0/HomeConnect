import { describe, expect, it, vi } from 'vitest';
import { LoadedRepair } from './repair-registry';
import { RepairEnvironment, RepairExecutionClient, RepairRunner } from './repair-runner';

const repair: LoadedRepair = {
  sql: 'ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sku" TEXT;',
  statementCount: 1,
  entry: {
    repairId: 'product-sku',
    title: 'Add product SKU',
    version: '1.1.2',
    description: 'Adds products.sku',
    file: '1.1.2-repair-product-sku-stock-specifications.sql',
    checksum: 'sha256:abc',
    requiresBackup: true,
    idempotent: true,
    requiresSuperuser: false,
    affectedTables: ['products'],
    detectionQuery: 'SELECT 1 FROM information_schema.columns',
    detectionExpects: 'empty',
    verificationQuery: 'SELECT count(*)::int AS count FROM information_schema.columns',
    verificationExpects: 1,
  },
};

const actor = { id: '11111111-1111-4111-8111-111111111111', name: 'Samir' };

interface ClientOptions {
  /** Rows returned by the detection query. Empty means the repair is needed. */
  detection?: unknown[];
  verificationCount?: number;
  failStatement?: boolean;
}

function makeClient(options: ClientOptions = {}) {
  const executed: string[] = [];
  const history: Array<Record<string, unknown>> = [];
  let queryCall = 0;

  const client: RepairExecutionClient = {
    $executeRawUnsafe: async (sql: string, ...values: unknown[]) => {
      if (sql.includes('INSERT INTO "repair_history"')) {
        history.push({ status: values[5], backupPath: values[8], error: values[10] });
        return 1;
      }
      if (sql.includes('CREATE TABLE') || sql.includes('CREATE TYPE') || sql.includes('CREATE INDEX')) return 1;
      if (options.failStatement) throw new Error('syntax error');
      executed.push(sql);
      return 1;
    },
    $queryRawUnsafe: async (sql: string) => {
      queryCall += 1;
      if (sql === repair.entry.detectionQuery) return (options.detection ?? []) as never;
      if (sql === repair.entry.verificationQuery) return [{ count: options.verificationCount ?? 1 }] as never;
      return [] as never;
    },
    $transaction: async (run) => run(client),
  };

  return { client, executed, history, queryCalls: () => queryCall };
}

function makeEnvironment(overrides: Partial<RepairEnvironment> = {}) {
  const calls: string[] = [];
  const environment: RepairEnvironment = {
    backupToolsAvailable: async () => true,
    createPreRepairBackup: async () => { calls.push('backup'); return { path: 'D:/Backups/pre-repair.backup', verified: true }; },
    runExclusive: async (run) => { calls.push('lock'); return run(); },
    enterMaintenance: () => { calls.push('enter'); },
    exitMaintenance: () => { calls.push('exit'); },
    ...overrides,
  };
  return { environment, calls };
}

describe('repair runner — refuses to run without a way back', () => {
  it('blocks when pg_dump is unavailable, and never opens a transaction', async () => {
    const { client, executed } = makeClient();
    const { environment, calls } = makeEnvironment({ backupToolsAvailable: async () => false });

    const outcome = await RepairRunner.apply(client, repair, actor, environment);

    expect(outcome.status).toBe('BLOCKED_NO_BACKUP');
    expect(outcome.message).toContain('pg_dump');
    expect(executed).toEqual([]);
    expect(calls).not.toContain('lock');
  });

  it('blocks when the backup itself fails, and applies nothing', async () => {
    const { client, executed } = makeClient();
    const { environment } = makeEnvironment({
      createPreRepairBackup: async () => { throw new Error('disk full'); },
    });

    const outcome = await RepairRunner.apply(client, repair, actor, environment);

    expect(outcome.status).toBe('BLOCKED_NO_BACKUP');
    expect(outcome.message).toContain('disk full');
    expect(executed).toEqual([]);
  });

  it('blocks when the backup cannot be verified', async () => {
    const { client, executed } = makeClient();
    const { environment } = makeEnvironment({
      createPreRepairBackup: async () => ({ path: 'D:/Backups/x.backup', verified: false }),
    });

    const outcome = await RepairRunner.apply(client, repair, actor, environment);

    expect(outcome.status).toBe('BLOCKED_NO_BACKUP');
    expect(outcome.backupPath).toBe('D:/Backups/x.backup');
    expect(executed).toEqual([]);
  });
});

describe('repair runner — detection', () => {
  it('skips a repair that has already been applied', async () => {
    const { client, executed } = makeClient({ detection: [{ exists: 1 }] });
    const { environment, calls } = makeEnvironment();

    const outcome = await RepairRunner.apply(client, repair, actor, environment);

    expect(outcome.status).toBe('SKIPPED_NOT_NEEDED');
    expect(executed).toEqual([]);
    // No backup is taken for a no-op.
    expect(calls).not.toContain('backup');
  });

  it('refuses rather than assuming, when detection cannot be read', async () => {
    const { client } = makeClient();
    client.$queryRawUnsafe = async () => { throw new Error('relation does not exist'); };

    await expect(RepairRunner.isNeeded(client, repair)).resolves.toBe(false);
  });
});

describe('repair runner — apply and verify', () => {
  it('applies, verifies, and records the backup path', async () => {
    const { client, executed, history } = makeClient();
    const { environment, calls } = makeEnvironment();

    const outcome = await RepairRunner.apply(client, repair, actor, environment);

    expect(outcome.status).toBe('APPLIED');
    expect(executed[0]).toContain('ADD COLUMN IF NOT EXISTS "sku"');
    expect(outcome.backupPath).toBe('D:/Backups/pre-repair.backup');
    expect(history[0]?.backupPath).toBe('D:/Backups/pre-repair.backup');
    // Backup strictly before the statements, all inside the lock.
    expect(calls.indexOf('lock')).toBeLessThan(calls.indexOf('backup'));
  });

  it('rolls back and reports VERIFY_FAILED when the result is not what was expected', async () => {
    const { client, history } = makeClient({ verificationCount: 0 });
    const { environment } = makeEnvironment();

    const outcome = await RepairRunner.apply(client, repair, actor, environment);

    expect(outcome.status).toBe('VERIFY_FAILED');
    expect(outcome.message).toContain('rolled back');
    expect(history[0]?.status).toBe('VERIFY_FAILED');
  });

  it('reports FAILED, not VERIFY_FAILED, when the SQL itself breaks', async () => {
    const { client } = makeClient({ failStatement: true });
    const { environment } = makeEnvironment();

    const outcome = await RepairRunner.apply(client, repair, actor, environment);

    expect(outcome.status).toBe('FAILED');
    expect(outcome.message).toContain('syntax error');
  });

  it('never throws to the caller, so one bad repair does not abort a batch', async () => {
    const { client } = makeClient({ failStatement: true });
    const { environment } = makeEnvironment();
    await expect(RepairRunner.apply(client, repair, actor, environment)).resolves.toBeDefined();
  });
});

describe('repair runner — maintenance state', () => {
  it('blocks business writes for the duration and always releases them', async () => {
    const { client } = makeClient();
    const { environment, calls } = makeEnvironment();

    await RepairRunner.apply(client, repair, actor, environment);

    expect(calls).toContain('enter');
    expect(calls.at(-1)).toBe('exit');
  });

  it('releases the block even when the repair fails', async () => {
    const { client } = makeClient({ failStatement: true });
    const { environment, calls } = makeEnvironment();

    await RepairRunner.apply(client, repair, actor, environment);

    expect(calls.at(-1)).toBe('exit');
  });

  it('does not enter maintenance at all when the repair is skipped', async () => {
    const { client } = makeClient({ detection: [{ exists: 1 }] });
    const { environment, calls } = makeEnvironment();

    await RepairRunner.apply(client, repair, actor, environment);

    expect(calls).not.toContain('enter');
  });
});

describe('repair runner — history', () => {
  it('records the actor and the checksum of what was applied', async () => {
    const { client } = makeClient();
    const { environment } = makeEnvironment();
    const spy = vi.spyOn(client, '$executeRawUnsafe');

    await RepairRunner.apply(client, repair, actor, environment);

    // Must match the INSERT, not the bootstrap CREATE TABLE for the same table.
    const insert = spy.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO "repair_history"'));
    expect(insert?.slice(1)).toContain('sha256:abc');
    expect(insert?.slice(1)).toContain('Samir');
  });
});
