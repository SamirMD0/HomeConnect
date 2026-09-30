import { EventEmitter } from 'node:events';
import type { ChildProcess, spawn as nodeSpawn } from 'node:child_process';
import type fsPromises from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPreMigrationGuard, type PreMigrationGuardOptions } from './pre-migration-guard';

vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn() }));

function child(exitCode: number | null = 0) {
  const process = new EventEmitter() as ChildProcess;
  Object.assign(process, { stderr: new EventEmitter(), kill: vi.fn(() => true) });
  if (exitCode !== null) queueMicrotask(() => process.emit('close', exitCode));
  return process;
}

function fixture() {
  const fs = {
    readFile: vi.fn().mockResolvedValue('2.0.2'),
    readdir: vi.fn().mockResolvedValue(['001', '002'].map((name) => ({ name, isDirectory: () => true }))),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ size: 1_000_001 }),
  };
  const spawn = vi.fn(() => child()) as unknown as typeof nodeSpawn & ReturnType<typeof vi.fn>;
  const options: PreMigrationGuardOptions = {
    currentVersion: '2.0.3', userDataDir: 'C:/data', backupDir: 'C:/backups',
    migrationsDir: 'C:/resources/prisma/migrations', databaseUrl: 'postgres://user:secret@host/test',
    isPackaged: true, fs: fs as unknown as typeof fsPromises, spawn,
    discoverPgDump: vi.fn(() => 'C:/pg_dump.exe'),
    queryAppliedMigrations: vi.fn(async () => new Set(['001'])),
    now: () => new Date('2026-10-01T12:00:00.000Z'),
  };
  return { fs, spawn, options };
}

afterEach(() => vi.useRealTimers());

describe('runPreMigrationGuard', () => {
  it('skips dev mode without spawning', async () => {
    const { options, spawn } = fixture();
    options.isPackaged = false;
    expect(await runPreMigrationGuard(options)).toEqual({ kind: 'skipped', reason: 'dev-mode' });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('skips the same version without spawning', async () => {
    const { options, fs, spawn } = fixture();
    fs.readFile.mockResolvedValue('2.0.3');
    expect(await runPreMigrationGuard(options)).toEqual({ kind: 'skipped', reason: 'same-version' });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('marks a version with no pending migrations', async () => {
    const { options, fs, spawn } = fixture();
    options.queryAppliedMigrations = vi.fn(async () => new Set(['001', '002']));
    expect(await runPreMigrationGuard(options)).toEqual({ kind: 'skipped', reason: 'no-pending-migrations' });
    expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('last-run-version.txt'), '2.0.3', 'utf8');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('refuses to migrate when pg_dump is missing', async () => {
    const { options, spawn } = fixture();
    options.discoverPgDump = () => null;
    expect(await runPreMigrationGuard(options)).toMatchObject({ kind: 'failed', code: 'BACKUP_TOOL_NOT_FOUND' });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('refuses to migrate after a failed backup command', async () => {
    const { options, spawn } = fixture();
    spawn.mockImplementation(() => child(1));
    expect(await runPreMigrationGuard(options)).toMatchObject({ kind: 'failed', code: 'BACKUP_FAILED_COMMAND', backupPath: expect.any(String) });
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('refuses to migrate when the backup is too small', async () => {
    const { options, fs, spawn } = fixture();
    fs.stat.mockResolvedValue({ size: 100 });
    expect(await runPreMigrationGuard(options)).toMatchObject({ kind: 'failed', code: 'BACKUP_FAILED_EMPTY', backupPath: expect.any(String) });
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous version marker after migration failure', async () => {
    const { options, fs, spawn } = fixture();
    spawn.mockImplementationOnce(() => child(0)).mockImplementationOnce(() => child(1));
    expect(await runPreMigrationGuard(options)).toMatchObject({ kind: 'failed', code: 'MIGRATION_FAILED', backupPath: expect.any(String) });
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('kills a migration that exceeds the timeout', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { options, spawn } = fixture();
    const hanging = child(null);
    spawn.mockImplementationOnce(() => child(0)).mockImplementationOnce(() => hanging);
    options.timeoutMs = 1000;
    const outcome = runPreMigrationGuard(options);
    for (let i = 0; i < 10 && spawn.mock.calls.length < 2; i += 1) await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await outcome).toMatchObject({ kind: 'failed', code: 'MIGRATION_TIMEOUT', backupPath: expect.any(String) });
    expect(hanging.kill).toHaveBeenCalled();
  });

  it('writes the new version after backup and migration succeed', async () => {
    const { options, fs, spawn } = fixture();
    expect(await runPreMigrationGuard(options)).toMatchObject({ kind: 'migrated', count: 1, backupPath: expect.any(String), from: '2.0.2', to: '2.0.3' });
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('last-run-version.txt'), '2.0.3', 'utf8');
  });

  it('treats a fresh database with no migration table as pending', async () => {
    const { options, spawn } = fixture();
    options.queryAppliedMigrations = vi.fn().mockRejectedValue(new Error('table does not exist'));
    expect(await runPreMigrationGuard(options)).toMatchObject({ kind: 'migrated', count: 2 });
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it('never returns secrets from subprocess output', async () => {
    const { options, spawn } = fixture();
    spawn.mockImplementation(() => {
      const process = child(1);
      queueMicrotask(() => process.stderr?.emit('data', 'postgres://user:secret@host/db'));
      return process;
    });
    const outcome = await runPreMigrationGuard(options);
    expect(outcome).toMatchObject({ kind: 'failed', code: 'BACKUP_FAILED_COMMAND' });
    if (outcome.kind === 'failed') expect(outcome.error).not.toMatch(/secret|postgres:\/\//i);
  });
});
