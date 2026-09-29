import { describe, expect, it } from 'vitest';
import {
  MigrationClient,
  MigrationExecutor,
  UnresolvedMigrationChecksumDriftError,
} from './migration-executor';
import { classifyMigrations, MigrationStatusSummary } from './migration-runner';
import { historicalChecksumDriftAllowlist, isAllowlistedDrift } from './checksum-allowlist';

const allowlist = historicalChecksumDriftAllowlist();
const thermal = allowlist.find((entry) => entry.migrationName === '20260924100000_add_appliance_shelf_thermal_template');
const categories = allowlist.find((entry) => entry.migrationName === '20260914180000_add_product_categories');

if (!thermal || !categories) throw new Error('allowlist smoke: expected two seed entries');

const unexpectedSqlClient: MigrationClient = {
  $queryRawUnsafe: async () => { throw new Error('Unexpected query'); },
  $executeRawUnsafe: async () => { throw new Error('Unexpected statement'); },
  $transaction: async () => { throw new Error('Unexpected transaction'); },
};

describe('historical checksum drift allowlist', () => {
  it('matches only on the exact (name, recorded, on-disk) triple', () => {
    expect(isAllowlistedDrift({ name: thermal.migrationName, recorded: thermal.recordedChecksum, onDisk: thermal.onDiskChecksum })?.migrationName).toBe(thermal.migrationName);
    // Same name and recorded, unknown on-disk -> not allowlisted.
    expect(isAllowlistedDrift({ name: thermal.migrationName, recorded: thermal.recordedChecksum, onDisk: 'a'.repeat(64) })).toBeNull();
    // Same name and on-disk, unknown recorded -> not allowlisted.
    expect(isAllowlistedDrift({ name: thermal.migrationName, recorded: 'b'.repeat(64), onDisk: thermal.onDiskChecksum })).toBeNull();
    // Correct triple but wrong migration name -> not allowlisted.
    expect(isAllowlistedDrift({ name: 'other', recorded: thermal.recordedChecksum, onDisk: thermal.onDiskChecksum })).toBeNull();
  });
});

describe('classifyMigrations with historical checksum drift', () => {
  it('reclassifies an allowlisted (name, recorded, on-disk) triple back to APPLIED with the drift flag set', () => {
    const bundled = [{ name: thermal.migrationName, sql: '', checksum: thermal.onDiskChecksum }];
    const rows = [{ migration_name: thermal.migrationName, checksum: thermal.recordedChecksum, finished_at: new Date('2026-09-24T00:00:00Z'), rolled_back_at: null, applied_steps_count: 1 }];
    const summary = classifyMigrations(bundled, rows);
    expect(summary.mismatched).toEqual([]);
    expect(summary.historicalChecksumDrift).toEqual([thermal.migrationName]);
    const entry = summary.entries[0];
    expect(entry.state).toBe('APPLIED');
    expect(entry.historicalChecksumDrift).toBe(true);
    expect(entry.recordedChecksum).toBe(thermal.recordedChecksum);
  });

  it('keeps unknown drift as CHECKSUM_MISMATCH', () => {
    const bundled = [{ name: thermal.migrationName, sql: '', checksum: 'c'.repeat(64) }];
    const rows = [{ migration_name: thermal.migrationName, checksum: thermal.recordedChecksum, finished_at: new Date('2026-09-24T00:00:00Z'), rolled_back_at: null, applied_steps_count: 1 }];
    const summary = classifyMigrations(bundled, rows);
    expect(summary.mismatched).toEqual([thermal.migrationName]);
    expect(summary.historicalChecksumDrift).toEqual([]);
    expect(summary.entries[0].state).toBe('CHECKSUM_MISMATCH');
    expect(summary.entries[0].recordedChecksum).toBe(thermal.recordedChecksum);
  });
});

describe('MigrationExecutor.applyPending checksum enforcement', () => {
  function makeSummary(overrides: Partial<MigrationStatusSummary>): MigrationStatusSummary {
    return {
      entries: [],
      pending: [],
      failed: [],
      mismatched: [],
      unknownInDatabase: [],
      databaseIsNewer: false,
      historicalChecksumDrift: [],
      ...overrides,
    };
  }

  it('refuses to run any migration when there is an unallowlisted checksum mismatch', async () => {
    const originalStatus = MigrationExecutor.status;
    const originalReadRows = MigrationExecutor.readRows;
    MigrationExecutor.status = async () => makeSummary({ mismatched: ['bad_migration'], entries: [{ name: 'bad_migration', state: 'CHECKSUM_MISMATCH', checksum: 'x', appliedAt: null, recordedChecksum: 'y' }] });
    MigrationExecutor.readRows = async () => [];
    try {
      await expect(MigrationExecutor.applyPending(unexpectedSqlClient, [{ name: 'bad_migration', sql: '', checksum: 'x' }]))
        .rejects.toBeInstanceOf(UnresolvedMigrationChecksumDriftError);
    } finally {
      MigrationExecutor.status = originalStatus;
      MigrationExecutor.readRows = originalReadRows;
    }
  });

  it('proceeds when every mismatch has been reclassified as allowlisted drift', async () => {
    const originalStatus = MigrationExecutor.status;
    MigrationExecutor.status = async () => makeSummary({
      historicalChecksumDrift: [thermal.migrationName],
      entries: [{ name: thermal.migrationName, state: 'APPLIED', checksum: thermal.onDiskChecksum, appliedAt: new Date(), historicalChecksumDrift: true, recordedChecksum: thermal.recordedChecksum }],
    });
    try {
      const outcomes = await MigrationExecutor.applyPending(unexpectedSqlClient, [{ name: thermal.migrationName, sql: '', checksum: thermal.onDiskChecksum }]);
      expect(outcomes).toEqual([]);
    } finally {
      MigrationExecutor.status = originalStatus;
    }
  });
});
