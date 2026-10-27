import { describe, expect, it, vi } from 'vitest';
import { applyBundledMigrations } from './apply-bundled-migrations';
import {
  MigrationRunner,
  type PrismaMigrationRow,
} from '../backend/src/features/maintenance/migration-runner';
import { historicalChecksumDriftAllowlist } from '../backend/src/features/maintenance/checksum-allowlist';
import type { MigrationClient } from '../backend/src/features/maintenance/migration-executor';
const allowed = historicalChecksumDriftAllowlist().find(
  (e) => e.migrationName === '20260914180000_add_product_categories'
)!;
const migration = MigrationRunner.readBundled().find((m) => m.name === allowed.migrationName)!;
function fixture(checksum: string) {
  const row: PrismaMigrationRow = {
    migration_name: migration.name,
    checksum,
    finished_at: new Date(),
    rolled_back_at: null,
    applied_steps_count: 1,
  };
  const execute = vi.fn().mockResolvedValue(0),
    query = vi.fn().mockResolvedValue([row]),
    transaction = vi.fn();
  return {
    client: {
      $executeRawUnsafe: execute,
      $queryRawUnsafe: query,
      $transaction: transaction,
    } as unknown as MigrationClient,
    row,
    execute,
    query,
    transaction,
  };
}
describe('apply bundled migrations safeguards', () => {
  it('refuses the business database before any database command', async () => {
    const f = fixture(allowed.recordedChecksum);
    await expect(
      applyBundledMigrations('postgresql://localhost/homeconnect', f.client, [migration], vi.fn())
    ).rejects.toThrow(/Refusing/);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.query).not.toHaveBeenCalled();
  });
  it('accepts and prints the existing allowlisted checksum triple without rewriting it', async () => {
    const f = fixture(allowed.recordedChecksum),
      log = vi.fn();
    expect(migration.checksum).toBe(allowed.onDiskChecksum);
    const result = await applyBundledMigrations(
      'postgresql://localhost/homeconnect_reconcile',
      f.client,
      [migration],
      log
    );
    expect(result.summary.historicalChecksumDrift).toEqual([migration.name]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('ALLOWLIST ACCEPT ' + migration.name));
    expect(f.row.checksum).toBe(allowed.recordedChecksum);
    expect(f.transaction).not.toHaveBeenCalled();
    expect(
      f.execute.mock.calls.every(([sql]) => String(sql).startsWith('CREATE TABLE IF NOT EXISTS'))
    ).toBe(true);
  });
  it('prints rejection and blocks an unknown checksum with no execution transaction', async () => {
    const f = fixture('0'.repeat(64)),
      log = vi.fn();
    await expect(
      applyBundledMigrations(
        'postgresql://localhost/homeconnect_reconcile',
        f.client,
        [migration],
        log
      )
    ).rejects.toThrow(/checksum/);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('ALLOWLIST REJECT ' + migration.name));
    expect(f.transaction).not.toHaveBeenCalled();
  });
});
