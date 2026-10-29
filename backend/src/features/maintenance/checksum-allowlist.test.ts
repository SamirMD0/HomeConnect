import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
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

  /**
   * Installations migrated from a Windows checkout (the business PC among them)
   * recorded init's CRLF bytes, while git ships LF. Without this entry a build
   * from a clean checkout refuses every update on those installations.
   */
  it('accepts the CRLF-recorded init checksum against the LF file that git ships', () => {
    const init = fs.readFileSync(path.join(migrationsDirectory, '20260723075336_init', 'migration.sql'));
    const lf = sha256(init);
    const crlf = sha256(Buffer.from(init.toString('utf8').replace(/\n/g, '\r\n'), 'utf8'));
    expect(lf).toBe('4557f861d6d1dcfecbd7b7600372c772227123ba8a8a6c39ed5102fd69afbeba');
    expect(isAllowlistedDrift({ name: '20260723075336_init', recorded: crlf, onDisk: lf })?.migrationName).toBe('20260723075336_init');
    // The reverse (a CRLF build) is not allowlisted; the guard below keeps builds LF instead.
    expect(isAllowlistedDrift({ name: '20260723075336_init', recorded: lf, onDisk: crlf })).toBeNull();
  });
});

const migrationsDirectory = path.resolve(__dirname, '../../../prisma/migrations');
const sha256 = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');

describe('bundled migration bytes', () => {
  /**
   * Checksums are over raw bytes, so a CRLF copy hashes differently from the LF
   * file git stores. A release packs whatever is on disk, so one stale CRLF file
   * in the build checkout ships a checksum no LF-recorded database expects.
   * If this fails, refresh the file from git: `git checkout -- <path>`.
   */
  it('contains no carriage returns in any migration.sql', () => {
    const withCr = fs.readdirSync(migrationsDirectory)
      .filter((name) => fs.existsSync(path.join(migrationsDirectory, name, 'migration.sql')))
      .filter((name) => fs.readFileSync(path.join(migrationsDirectory, name, 'migration.sql')).includes(0x0d));
    expect(withCr).toEqual([]);
  });

  it('pins every allowlisted on-disk checksum to the bytes actually bundled', () => {
    for (const entry of allowlist) {
      const file = path.join(migrationsDirectory, entry.migrationName, 'migration.sql');
      expect(sha256(fs.readFileSync(file)), entry.migrationName).toBe(entry.onDiskChecksum);
    }
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
