import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareRollback, readRollback, updateRollback, rollbackStatePath } from './update-rollback';
import { migrationEnvironment, safeMigrationError } from './prisma-migration-runtime';
const { recover } = require('./rollback-helper.cjs');

const roots: string[] = [];
afterEach(async () => {
  // Each root is a unique temporary test directory created by this fixture.
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hc-rollback-test-'));
  roots.push(root);
  const installDir = path.join(root, 'install');
  const userDataDir = path.join(root, 'user-data');
  await fs.mkdir(path.join(installDir, 'resources'), { recursive: true });
  await fs.writeFile(path.join(installDir, 'HomeConnect.exe'), 'previous executable');
  await fs.writeFile(path.join(installDir, 'resources', 'app.asar'), 'previous archive');
  const runCommand = vi.fn(async (_command: string, args: string[]) => {
    if (args.includes('-Fc')) await fs.writeFile(args[args.indexOf('-f') + 1], 'verified database archive');
  });
  const launchWatchdog = vi.fn(async () => {});
  const options = { from: '2.0.6', to: '2.0.7', installDir, userDataDir,
    envFilePath: path.join(userDataDir, 'config', 'production.env'), databaseUrl: 'postgres://u:secret@host/test',
    pgDump: 'pg_dump', pgRestore: 'pg_restore', psql: 'psql', runCommand, launchWatchdog,
    helperPath: path.join(__dirname, 'rollback-helper.cjs') };
  return { root, options, runCommand, launchWatchdog };
}

describe('packaged migration runtime', () => {
  it('points the engine at a real unpacked file even when the CLI is archived', () => {
    const entry = path.join('C:', 'App', 'resources', 'app.asar', 'node_modules', 'prisma', 'build', 'index.js');
    expect(migrationEnvironment(entry, 'postgres://fixture').PRISMA_SCHEMA_ENGINE_BINARY)
      .toBe(path.resolve('C:', 'App', 'resources', 'app.asar.unpacked', 'node_modules', '@prisma', 'engines', 'schema-engine-windows.exe'));
  });
  it('preserves development engine overrides', () => {
    const previous = process.env.PRISMA_SCHEMA_ENGINE_BINARY;
    process.env.PRISMA_SCHEMA_ENGINE_BINARY = 'custom-engine';
    try { expect(migrationEnvironment(path.resolve('node_modules/prisma/build/index.js'), 'postgres://fixture').PRISMA_SCHEMA_ENGINE_BINARY).toBe('custom-engine'); }
    finally { if (previous) process.env.PRISMA_SCHEMA_ENGINE_BINARY = previous; else delete process.env.PRISMA_SCHEMA_ENGINE_BINARY; }
  });
  it('keeps actionable errors while removing both encoded and decoded passwords', () => {
    const safe = safeMigrationError('P3018 password s%40cret s@cret postgres://u:s%40cret@host/db', 'postgres://u:s%40cret@host/db');
    expect(safe).toContain('P3018');
    expect(safe).not.toMatch(/s%40cret|s@cret|postgres:\/\//);
  });
});

describe('update rollback', () => {
  it('saves verified old files and a readable archive before arming recovery', async () => {
    const { options, runCommand, launchWatchdog } = await fixture();
    const state = await prepareRollback(options);
    expect(state.status).toBe('prepared');
    expect(runCommand.mock.calls[1][1]).toEqual(['--list', state.backupPath]);
    expect(launchWatchdog).toHaveBeenCalledOnce();
    expect(await readRollback(options.userDataDir)).toMatchObject({ from: '2.0.6', to: '2.0.7', databaseMayHaveChanged: false });
  });
  it('does not arm an update when its archive cannot be verified', async () => {
    const { options, runCommand, launchWatchdog } = await fixture();
    runCommand.mockImplementationOnce(async (_command, args) => { await fs.writeFile(args[args.indexOf('-f') + 1], 'backup'); });
    runCommand.mockImplementationOnce(async () => { throw new Error('archive damaged'); });
    await expect(prepareRollback(options)).rejects.toThrow('archive damaged');
    expect(launchWatchdog).not.toHaveBeenCalled();
    expect(await readRollback(options.userDataDir)).toBeNull();
  });
  it('only changes the pending target version, never an ordinary later launch', async () => {
    const { options } = await fixture();
    await prepareRollback(options);
    expect(await updateRollback(options.userDataDir, '2.0.6', { status: 'committed' })).toBe(false);
    expect(await updateRollback(options.userDataDir, '2.0.7', { status: 'committed' })).toBe(true);
    expect(await updateRollback(options.userDataDir, '2.0.7', { status: 'rollback-requested' })).toBe(false);
  });
  it('restores the exact old app and version marker, then relaunches, without touching an unchanged database', async () => {
    const { options } = await fixture();
    const state = await prepareRollback(options);
    await fs.writeFile(path.join(options.installDir, 'resources', 'app.asar'), 'failed new archive');
    const run = vi.fn();
    const launch = vi.fn();
    await recover(rollbackStatePath(options.userDataDir), state, { skipProcessWait: true, run, launch });
    expect(run).not.toHaveBeenCalled();
    expect(await fs.readFile(path.join(options.installDir, 'resources', 'app.asar'), 'utf8')).toBe('previous archive');
    expect(await fs.readFile(path.join(options.userDataDir, 'config', 'last-run-version.txt'), 'utf8')).toBe('2.0.6');
    expect(await readRollback(options.userDataDir)).toMatchObject({ status: 'rolled-back' });
    expect(launch).toHaveBeenCalledOnce();
    expect(launch.mock.calls[0][1].ELECTRON_RUN_AS_NODE).toBeUndefined();
    await expect(prepareRollback(options)).rejects.toThrow('already rejected');
  });
  it('never restores or launches a previous app when the archive is corrupted', async () => {
    const { options } = await fixture();
    const state = await prepareRollback(options);
    await fs.writeFile(state.backupPath, 'corrupted');
    const run = vi.fn();
    const launch = vi.fn();
    await expect(recover(rollbackStatePath(options.userDataDir), { ...state, databaseMayHaveChanged: true }, { skipProcessWait: true, run, launch })).rejects.toThrow('checksum');
    expect(run).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
  });
  it('rejects snapshot traversal before copying any files', async () => {
    const { options } = await fixture();
    const state = await prepareRollback(options);
    state.files.push({ name: '../outside', sha256: 'bad' });
    await expect(recover(rollbackStatePath(options.userDataDir), state, { skipProcessWait: true })).rejects.toThrow('snapshot checksum');
  });

  it('restores schema and data atomically before restoring or relaunching the previous app', async () => {
    const { options } = await fixture();
    const state = await prepareRollback(options);
    state.databaseMayHaveChanged = true;
    const run = vi.fn(async (_command, args) => {
      if (args.includes('--file') && !args.includes('--single-transaction')) {
        await fs.writeFile(args[args.indexOf('--file') + 1], 'CREATE SCHEMA public;\nCREATE TABLE fixture(id int);');
      }
    });
    const launch = vi.fn();
    await recover(rollbackStatePath(options.userDataDir), state, { skipProcessWait: true, databaseUrl: options.databaseUrl, run, launch });
    expect(run.mock.calls[1][1]).toEqual(expect.arrayContaining(['--single-transaction', 'ON_ERROR_STOP=1', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;']));
    expect(await fs.readFile(path.join(path.dirname(state.backupPath), 'restore.sql'), 'utf8')).toContain('CREATE SCHEMA IF NOT EXISTS public;');
    expect(launch).toHaveBeenCalledOnce();
  });

  it('does not launch the older app against data that could not be restored', async () => {
    const { options } = await fixture();
    const state = await prepareRollback(options);
    const launch = vi.fn();
    await expect(recover(rollbackStatePath(options.userDataDir), { ...state, databaseMayHaveChanged: true }, {
      skipProcessWait: true, databaseUrl: options.databaseUrl, run: vi.fn().mockRejectedValue(new Error('restore failed')), launch,
    })).rejects.toThrow('restore failed');
    expect(launch).not.toHaveBeenCalled();
    expect(await readRollback(options.userDataDir)).toMatchObject({ status: 'prepared' });
  });
});
