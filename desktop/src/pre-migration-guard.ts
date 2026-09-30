import { spawn as nodeSpawn } from 'child_process';
import type { ChildProcess, SpawnOptions } from 'child_process';
import fsPromises from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';

export type PreMigrationFailureCode =
  | 'BACKUP_TOOL_NOT_FOUND'
  | 'BACKUP_FAILED_COMMAND'
  | 'BACKUP_FAILED_EMPTY'
  | 'MIGRATION_FAILED'
  | 'MIGRATION_TIMEOUT';

export type PreMigrationOutcome =
  | { kind: 'skipped'; reason: 'dev-mode' | 'same-version' | 'no-pending-migrations' }
  | { kind: 'migrated'; count: number; backupPath: string; from: string; to: string }
  | { kind: 'failed'; code: PreMigrationFailureCode; error: string; backupPath?: string; from: string; to: string };

export interface PreMigrationGuardOptions {
  currentVersion: string;
  userDataDir: string;
  backupDir: string;
  migrationsDir: string;
  databaseUrl: string;
  isPackaged: boolean;
  timeoutMs?: number;
  spawn?: typeof nodeSpawn;
  fs?: typeof fsPromises;
  discoverPgDump?: () => string | null;
  queryAppliedMigrations?: (dbUrl: string) => Promise<Set<string>>;
  logger?: { info(msg: string, meta?: unknown): void; error(msg: string, meta?: unknown): void };
  now?: () => Date;
}

async function appliedMigrations(dbUrl: string): Promise<Set<string>> {
  const client = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const rows = await client.$queryRawUnsafe<Array<{ migration_name: string; finished_at: Date | null }>>(
      'SELECT migration_name, finished_at FROM _prisma_migrations',
    );
    return new Set(rows.filter((row) => row.finished_at !== null).map((row) => row.migration_name));
  } finally {
    await client.$disconnect();
  }
}

function missingMigrationsTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return /42P01|_prisma_migrations.*does not exist|table does not exist/i.test(message);
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-') || 'unknown';
}

function discoverPackagedPgDump(): string | null {
  try {
    const compiledTools = path.join(process.resourcesPath, 'dist/server/backend/src/features/backup/postgres-tools.js');
    const { PostgresToolDiscovery } = require(compiledTools) as {
      PostgresToolDiscovery: { findTool(name: 'pg_dump'): string | null };
    };
    return PostgresToolDiscovery.findTool('pg_dump');
  } catch {
    return null;
  }
}

function runCommand(
  spawn: typeof nodeSpawn,
  command: string,
  args: string[],
  options: SpawnOptions,
  timeoutMs: number,
): Promise<'success' | 'failed' | 'timeout'> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(command, args, { ...options, stdio: ['ignore', 'ignore', 'pipe'], shell: false, windowsHide: true });
    } catch {
      resolve('failed');
      return;
    }
    child.stderr?.on('data', () => undefined);
    let settled = false;
    const finish = (result: 'success' | 'failed' | 'timeout') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* A dead child is already stopped. */ }
      finish('timeout');
    }, timeoutMs);
    child.once('error', () => finish('failed'));
    child.once('close', (code) => finish(code === 0 ? 'success' : 'failed'));
  });
}

export async function runPreMigrationGuard(options: PreMigrationGuardOptions): Promise<PreMigrationOutcome> {
  if (!options.isPackaged) {
    options.logger?.info('pre-migration: dev-mode');
    return { kind: 'skipped', reason: 'dev-mode' };
  }

  const io = options.fs ?? fsPromises;
  const spawn = options.spawn ?? nodeSpawn;
  const fromFile = path.join(options.userDataDir, 'config', 'last-run-version.txt');
  const to = options.currentVersion;
  let from = '';
  let backupPath: string | undefined;
  let migrationStarted = false;
  const failed = (code: PreMigrationFailureCode, error: string): PreMigrationOutcome => {
    options.logger?.info(`pre-migration: ${code}`);
    return { kind: 'failed', code, error, backupPath, from, to };
  };

  try {
    try {
      from = (await io.readFile(fromFile, 'utf8')).trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return failed('MIGRATION_FAILED', 'Could not read the previous version');
    }
    if (from === to) return { kind: 'skipped', reason: 'same-version' };
    if (!options.databaseUrl) return failed('MIGRATION_FAILED', 'Database configuration is missing');

    const entries = await io.readdir(options.migrationsDir, { withFileTypes: true });
    const migrations = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    let applied: Set<string>;
    try {
      applied = await (options.queryAppliedMigrations ?? appliedMigrations)(options.databaseUrl);
    } catch (error) {
      if (!missingMigrationsTable(error)) return failed('MIGRATION_FAILED', 'Could not inspect applied migrations');
      applied = new Set();
    }
    const pending = migrations.filter((name) => !applied.has(name));
    if (pending.length === 0) {
      await io.mkdir(path.dirname(fromFile), { recursive: true });
      await io.writeFile(fromFile, to, 'utf8');
      return { kind: 'skipped', reason: 'no-pending-migrations' };
    }

    const pgDump = (options.discoverPgDump ?? discoverPackagedPgDump)();
    if (!pgDump) return failed('BACKUP_TOOL_NOT_FOUND', 'PostgreSQL backup tool was not found');
    const timestamp = (options.now ?? (() => new Date()))().toISOString().replace(/[:.]/g, '-');
    backupPath = path.join(options.backupDir, `pre-update-${safeFilePart(from)}-to-${safeFilePart(to)}-${timestamp}.backup`);
    await io.mkdir(options.backupDir, { recursive: true });
    const backupResult = await runCommand(
      spawn, pgDump, ['--no-password', '-Fc', '-f', backupPath, options.databaseUrl],
      { env: process.env }, Math.max(1, Math.floor((options.timeoutMs ?? 300_000) / 2)),
    );
    if (backupResult !== 'success') return failed('BACKUP_FAILED_COMMAND', 'Pre-update backup did not complete');
    let backupSize = 0;
    try { backupSize = (await io.stat(backupPath)).size; } catch { /* Missing output is an untrusted backup. */ }
    if (backupSize < 1_000_000) return failed('BACKUP_FAILED_EMPTY', 'Pre-update backup file is too small');

    let prismaEntry: string;
    try { prismaEntry = require.resolve('prisma/build/index.js'); }
    catch { return failed('MIGRATION_FAILED', 'Prisma migration tool was not found'); }
    const schemaPath = path.join(path.dirname(options.migrationsDir), 'schema.prisma');
    migrationStarted = true;
    const migrationResult = await runCommand(
      spawn, process.execPath, [prismaEntry, 'migrate', 'deploy', '--schema', schemaPath],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DATABASE_URL: options.databaseUrl } },
      options.timeoutMs ?? 300_000,
    );
    if (migrationResult === 'timeout') return failed('MIGRATION_TIMEOUT', 'Database update timed out');
    if (migrationResult !== 'success') return failed('MIGRATION_FAILED', 'Database update did not complete');

    await io.mkdir(path.dirname(fromFile), { recursive: true });
    await io.writeFile(fromFile, to, 'utf8');
    options.logger?.info(`pre-migration: applied ${pending.length} migration(s)`);
    return { kind: 'migrated', count: pending.length, backupPath, from, to };
  } catch {
    return failed(migrationStarted || !backupPath ? 'MIGRATION_FAILED' : 'BACKUP_FAILED_COMMAND', 'Pre-migration checks did not complete');
  }
}
