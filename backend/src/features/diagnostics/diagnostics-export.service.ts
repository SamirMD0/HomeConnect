import fs from 'fs';
import os from 'os';
import { redactSensitiveData } from '../../lib/redaction';
import { BackupService } from '../backup/backup.service';
import { parsePostgresConnectionString } from '../backup/postgres-url';
import { MigrationExecutor } from '../maintenance/migration-executor';
import { MigrationRunner } from '../maintenance/migration-runner';
import { RepairHistoryRepository } from '../maintenance/repair-history.repository';
import { RepairRegistry } from '../maintenance/repair-registry';
import { PreflightService } from '../preflight/preflight.service';
import { prisma } from '../../lib/prisma';
import { getLogFilePath } from './error-logger';
import { createZip, ZipEntry } from './zip-writer';

/**
 * Builds the diagnostics ZIP an operator sends when something goes wrong.
 *
 * The hard rule is that it contains **no secrets and no business data**. That is
 * enforced twice: sections are built as explicit allow-lists rather than dumps
 * of whatever is lying around, and then `assertNoSecretValues` re-reads every
 * byte before the archive is sealed and throws if a real secret value appears.
 * Failing closed is right here — a leaked ZIP cannot be recalled.
 */

const APP_VERSION = process.env.npm_package_version ?? process.env.APP_VERSION ?? 'unknown';

/** Env vars reported as present/absent only. Values are never read into the archive. */
const REPORTED_ENV_VARS = [
  'DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'BACKEND_ENV_FILE',
  'NODE_ENV', 'PORT', 'HOME_CONNECT_USER_DATA',
];

const MAX_ERROR_LINES = 500;

export interface DiagnosticsArchive {
  filename: string;
  buffer: Buffer;
}

export class DiagnosticsExportService {
  static async build(now = new Date()): Promise<DiagnosticsArchive> {
    const entries: ZipEntry[] = [
      json('meta.json', await meta(now)),
      json('environment.json', environment()),
      json('preflight.json', await safely(() => PreflightService.run(APP_VERSION))),
      json('migrations.json', await safely(migrationStatus)),
      json('repairs.json', await safely(repairs)),
      json('repair-history.json', await safely(history)),
      json('backups.json', await safely(backups)),
      { name: 'errors.jsonl', content: errorLogTail() },
    ];

    assertNoSecretValues(entries);

    return {
      filename: `homeconnect-diagnostics-${stamp(now)}.zip`,
      buffer: createZip(entries, now),
    };
  }
}

async function meta(now: Date) {
  return {
    generatedAt: now.toISOString(),
    appVersion: APP_VERSION,
    nodeVersion: process.version,
    electronVersion: process.versions.electron ?? null,
    platform: `${process.platform} ${os.release()}`,
    arch: process.arch,
    uptimeSeconds: Math.round(process.uptime()),
    postgresVersion: await safely(postgresVersion),
  };
}

/**
 * Presence only. A `set`/`missing` summary is what actually helps diagnose a
 * broken install; the values are exactly what must never leave the machine.
 */
function environment() {
  const present = Object.fromEntries(
    REPORTED_ENV_VARS.map((name) => [name, process.env[name]?.trim() ? 'set' : 'missing'])
  );

  let database: Record<string, string> | { error: string };
  try {
    const info = parsePostgresConnectionString();
    // Host, port and database name only — never the user, never the password.
    database = { host: info.host, port: info.port, database: info.database };
  } catch (error) {
    database = { error: error instanceof Error ? error.message : 'DATABASE_URL could not be read' };
  }

  return { variables: present, database, envFilePath: process.env.BACKEND_ENV_FILE ?? null };
}

async function postgresVersion(): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version() AS version`;
  return rows[0]?.version ?? null;
}

async function migrationStatus() {
  const summary = await MigrationExecutor.status(
    prisma as unknown as Parameters<typeof MigrationExecutor.status>[0],
    MigrationRunner.readBundled()
  );
  return {
    pending: summary.pending,
    failed: summary.failed,
    mismatched: summary.mismatched,
    databaseIsNewer: summary.databaseIsNewer,
    applied: summary.entries.filter((entry) => entry.state === 'APPLIED').map((entry) => entry.name),
  };
}

/** Manifest metadata only — the SQL itself is already in the installer. */
function repairs() {
  const snapshot = RepairRegistry.load();
  return {
    directory: snapshot.directory,
    problems: snapshot.problems,
    repairs: snapshot.repairs.map((repair) => ({
      repairId: repair.entry.repairId,
      version: repair.entry.version,
      checksum: repair.entry.checksum,
      statementCount: repair.statementCount,
      requiresSuperuser: repair.entry.requiresSuperuser,
    })),
  };
}

function history() {
  return RepairHistoryRepository.list(prisma as unknown as Parameters<typeof RepairHistoryRepository.list>[0], 50);
}

/** Metadata about backups. Never an archive, and never its contents. */
async function backups() {
  return BackupService.listBackups({ page: 1, limit: 50, sortOrder: 'DESC' });
}

/** Tail of the error log. Already redacted on write; redacted again on read. */
function errorLogTail(): string {
  try {
    const file = getLogFilePath();
    if (!fs.existsSync(file)) return '';
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    return lines.slice(-MAX_ERROR_LINES)
      .map((line) => {
        try { return JSON.stringify(redactSensitiveData(JSON.parse(line))); } catch { return null; }
      })
      .filter(Boolean)
      .join('\n');
  } catch {
    return '';
  }
}

/**
 * Last line of defence. Checks for the *values* of real secrets rather than
 * their names — `"JWT_SECRET": "set"` is exactly what the archive should say,
 * while the secret itself must never appear.
 */
export function assertNoSecretValues(entries: ZipEntry[]): void {
  const text = entries
    .map((entry) => (Buffer.isBuffer(entry.content) ? entry.content.toString('utf8') : entry.content))
    .join('\n');

  const secrets = [process.env.JWT_SECRET, process.env.JWT_REFRESH_SECRET, databasePassword()]
    // Short values would produce false positives against ordinary text.
    .filter((secret): secret is string => Boolean(secret && secret.trim().length >= 6));

  for (const secret of secrets) {
    if (text.includes(secret)) throw new Error('Diagnostics export aborted: a secret value would have been included.');
  }

  if (/postgres(?:ql)?:\/\/[^\s"]*:[^\s"]*@/.test(text)) {
    throw new Error('Diagnostics export aborted: a connection string with credentials would have been included.');
  }
}

function databasePassword(): string | null {
  try { return parsePostgresConnectionString().password || null; } catch { return null; }
}

const json = (name: string, value: unknown): ZipEntry => ({ name, content: JSON.stringify(value, null, 2) });

/** A section that cannot be gathered becomes an error note, never a failed export. */
async function safely<T>(run: () => Promise<T> | T): Promise<T | { error: string }> {
  try { return await run(); } catch (error) {
    return { error: error instanceof Error ? error.message : 'Section unavailable' };
  }
}

const stamp = (value: Date) => value.toISOString().replace(/[:.]/g, '-').slice(0, 19);
