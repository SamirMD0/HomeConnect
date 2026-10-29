import { describe, expect, it } from 'vitest';
import { compareMigrationLevel, parseBackupMigrationHistory } from './backup-migration-level';

const copy = (rows: string[][], columns = 'id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count') =>
  [
    '--',
    '-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -',
    '--',
    `COPY public._prisma_migrations (${columns}) FROM stdin;`,
    ...rows.map((row) => row.join('\t')),
    '\\.',
    '',
  ].join('\r\n');

describe('backup migration level', () => {
  it('reads applied migrations and ignores rolled-back or unfinished rows', () => {
    const output = copy([
      ['1', 'c1', '2026-10-01 10:00:00+02', '20261001_a', '\\N', '\\N', '2026-10-01', '1'],
      ['2', 'c2', '\\N', '20261002_unfinished', '\\N', '\\N', '2026-10-02', '0'],
      ['3', 'c3', '2026-10-03 10:00:00+02', '20261003_rolled_back', '\\N', '2026-10-03 11:00:00+02', '2026-10-03', '0'],
      ['4', 'c4', '2026-10-04 10:00:00+02', '20261004_b', 'Resolved after applying the matching repair.', '\\N', '2026-10-04', '1'],
    ]);
    expect(parseBackupMigrationHistory(output)).toEqual(['20261001_a', '20261004_b']);
  });

  it('follows the column order in the COPY header', () => {
    const output = copy([['20261001_a', '2026-10-01 10:00:00+02', '\\N']], 'migration_name, finished_at, rolled_back_at');
    expect(parseBackupMigrationHistory(output)).toEqual(['20261001_a']);
  });

  it('returns nothing for an archive without migration history', () => {
    expect(parseBackupMigrationHistory('')).toEqual([]);
  });

  /** The 2026-10-29 incident: a business PC backup four updates behind a same-version laptop build. */
  it('allows an older backup and lists the updates to apply after restoring', () => {
    const level = compareMigrationLevel(['20261001_a', '20261003_b'], ['20261001_a', '20261003_b', '20261017_branches', '20261027_ownership']);
    expect(level).toEqual({ compatible: true, pendingAfterRestore: ['20261017_branches', '20261027_ownership'], newerThanApp: [] });
  });

  it('refuses a backup that holds updates this build does not ship', () => {
    const level = compareMigrationLevel(['20261001_a', '20261101_future'], ['20261001_a']);
    expect(level.compatible).toBe(false);
    expect(level.newerThanApp).toEqual(['20261101_future']);
  });

  it('treats an identical history as compatible with nothing pending', () => {
    expect(compareMigrationLevel(['20261001_a'], ['20261001_a'])).toEqual({ compatible: true, pendingAfterRestore: [], newerThanApp: [] });
  });
});
