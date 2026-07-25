import path from 'path';
import { describe, expect, it } from 'vitest';
import { BackupCommandRunner } from './backup-command-runner';
import { BackupOperationLock } from './backup-operation-lock';
import { assertPathInsideDirectory, assertSafeBackupDirectory } from './backup-paths';
import { BackupService } from './backup.service';
import { BackupSettings } from './backup.types';
import { parsePostgresConnectionString } from './postgres-url';

describe('backup safety helpers', () => {
  it('generates deterministic sortable backup filenames by type', () => {
    const now = new Date('2026-07-25T11:30:12.000Z');

    expect(BackupService.generateBackupFilename('MANUAL', now)).toMatch(
      /^homeconnect-\d{4}-\d{2}-\d{2}-\d{6}-manual\.backup$/
    );
    expect(BackupService.generateBackupFilename('AUTO', now)).toContain('-auto.backup');
    expect(BackupService.generateBackupFilename('PRE_RESTORE', now)).toContain('-pre-restore.backup');
  });

  it('rejects traversal outside configured backup directory', () => {
    const base = path.resolve('D:/safe/backups');

    expect(assertPathInsideDirectory(base, path.join(base, 'file.backup'))).toBe(
      path.join(base, 'file.backup')
    );
    expect(() => assertPathInsideDirectory(base, path.resolve('D:/safe/other/file.backup'))).toThrow(
      /inside the configured backup directory/
    );
  });

  it('rejects repository backup folders', () => {
    expect(() => assertSafeBackupDirectory(process.cwd())).toThrow(/project repository/);
  });

  it('builds pg_dump args without exposing the password', () => {
    const connection = parsePostgresConnectionString(
      'postgresql://postgres:secret-password@localhost:5433/homeconnect'
    );

    const args = BackupCommandRunner.pgDumpArgs(connection, 'D:/backups/test.backup');

    expect(args.join(' ')).not.toContain('secret-password');
    expect(args).toContain('--format=custom');
    expect(args).toContain('--dbname=homeconnect');
    expect(args).toContain('--username=postgres');
  });

  it('builds pg_restore validation and restore args safely', () => {
    const connection = parsePostgresConnectionString(
      'postgresql://postgres:secret-password@localhost:5433/homeconnect'
    );

    expect(BackupCommandRunner.pgRestoreListArgs('D:/backups/test.backup')).toEqual([
      '--list',
      'D:/backups/test.backup',
    ]);
    expect(BackupCommandRunner.pgRestoreArgs(connection, 'D:/backups/test.backup')).toEqual(
      expect.arrayContaining(['--clean', '--if-exists', '--dbname=homeconnect', 'D:/backups/test.backup'])
    );
    expect(BackupCommandRunner.pgRestoreArgs(connection, 'D:/backups/test.backup').join(' ')).not.toContain(
      'secret-password'
    );
  });

  it('prevents overlapping operations', async () => {
    const first = BackupOperationLock.runExclusive('BACKUP', async () => {
      await expect(BackupOperationLock.runExclusive('RESTORE', async () => undefined)).rejects.toThrow(
        /already running/
      );
      return 'done';
    });

    await expect(first).resolves.toBe('done');
  });

  it('detects missed startup automatic backups', () => {
    const settings: BackupSettings = {
      backupDirectory: 'C:/Users/User/Documents/HomeConnect Backups',
      automaticBackupsEnabled: true,
      automaticBackupTime: '02:00',
      automaticRetentionCount: 30,
      pgDumpPath: null,
      pgRestorePath: null,
      psqlPath: null,
      lastAutomaticBackupAt: '2026-07-23T00:00:00.000Z',
    };

    expect(BackupService.shouldRunStartupCatchup(settings, new Date('2026-07-25T00:00:01.000Z'))).toBe(true);
    expect(
      BackupService.shouldRunStartupCatchup(
        { ...settings, lastAutomaticBackupAt: '2026-07-24T23:00:00.000Z' },
        new Date('2026-07-25T00:00:01.000Z')
      )
    ).toBe(false);
  });
});
