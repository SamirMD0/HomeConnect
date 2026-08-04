import { prisma } from '../../lib/prisma';
import { BackupSettingsStore } from '../backup/backup-settings.store';
import { parsePostgresConnectionString } from '../backup/postgres-url';
import {
  checkDatabaseName,
  checkDatabaseReachable,
  checkDatabaseUrlParses,
  checkEnvFile,
  checkExtensionPrivilege,
  checkPasswordEncoding,
  checkPgClientTools,
  checkPortsFree,
  checkRequiredTables,
  checkRequiredVars,
  probeTcp,
} from './preflight.checks';
import { PreflightCheckResult, PreflightReport, skipped, worstStatus } from './preflight.types';

/**
 * Runs every preflight check and assembles the report.
 *
 * **This service never writes.** Every query below is a read against
 * `information_schema` or `pg_roles`, or a TCP probe. Fixing anything it finds
 * is a separate, admin-approved action in Maintenance.
 *
 * A check that throws is reported as a failed check, never propagated — a
 * diagnostic tool that itself crashes on a broken machine is useless.
 */

/**
 * Columns whose absence has already bricked the app once: a half-applied
 * migration left `payment_allocations.voidedAt` missing and every financial
 * screen returned 500 with Prisma `P2022`.
 */
const SPOT_CHECK_COLUMNS: Array<{ table: string; column: string }> = [
  { table: 'payment_allocations', column: 'voidedAt' },
  { table: 'payment_allocations', column: 'correctionId' },
  { table: 'products', column: 'sku' },
  { table: 'sales_orders', column: 'id' },
];

export interface PreflightOptions {
  /**
   * Ports found busy by the caller. Only the Electron shell can meaningfully
   * check this, because it runs *before* the backend binds 3001/3002; from
   * inside the running app those ports are always occupied by this app itself.
   * Omitted means "not checked here", which reports as SKIPPED rather than
   * inventing a PASS.
   */
  busyPorts?: number[];
}

export class PreflightService {
  static async run(appVersion: string, options: PreflightOptions = {}): Promise<PreflightReport> {
    const checks: PreflightCheckResult[] = [];
    const databaseUrl = process.env.DATABASE_URL;

    checks.push(checkEnvFile(process.env.BACKEND_ENV_FILE ?? null));
    checks.push(checkRequiredVars(process.env));

    const urlCheck = checkDatabaseUrlParses(databaseUrl);
    checks.push(urlCheck);
    checks.push(checkPasswordEncoding(databaseUrl));

    const connection = safeParse(databaseUrl);

    if (!connection) {
      // Without a usable address, every downstream check is meaningless rather
      // than failing — reporting five red rows for one root cause is noise.
      checks.push(skipped('DATABASE_REACHABLE', 'PostgreSQL connection', 'Skipped: the database address could not be read.'));
      checks.push(skipped('DATABASE_NAME', 'Database name', 'Skipped: the database address could not be read.'));
      checks.push(skipped('REQUIRED_TABLES', 'Database structure', 'Skipped: not connected.'));
      checks.push(skipped('EXTENSION_PRIVILEGE', 'Database permissions', 'Skipped: not connected.'));
    } else {
      const probe = await probeTcp(connection.host, Number(connection.port));
      checks.push(checkDatabaseReachable(probe, connection.host, connection.port));

      if (!probe.ok) {
        checks.push(skipped('DATABASE_NAME', 'Database name', 'Skipped: PostgreSQL is not reachable.'));
        checks.push(skipped('REQUIRED_TABLES', 'Database structure', 'Skipped: PostgreSQL is not reachable.'));
        checks.push(skipped('EXTENSION_PRIVILEGE', 'Database permissions', 'Skipped: PostgreSQL is not reachable.'));
      } else {
        checks.push(checkDatabaseName(connection.database, await currentDatabase()));
        checks.push(checkRequiredTables(await missingColumns()));
        checks.push(checkExtensionPrivilege(await isSuperuser(), await pgTrgmMissing()));
      }
    }

    checks.push(checkPgClientTools(await backupSettings()));
    checks.push(options.busyPorts
      ? checkPortsFree(options.busyPorts)
      : skipped('PORTS_FREE', 'Application ports', 'Checked by the desktop app at startup, before the server starts.'));

    return {
      status: worstStatus(checks),
      canStart: !checks.some((check) => check.status === 'FAIL'),
      checkedAt: new Date().toISOString(),
      appVersion,
      checks,
    };
  }
}

function safeParse(databaseUrl: string | undefined) {
  if (!databaseUrl) return null;
  try { return parsePostgresConnectionString(databaseUrl); } catch { return null; }
}

async function currentDatabase(): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
    return rows[0]?.name ?? null;
  } catch { return null; }
}

async function missingColumns(): Promise<string[]> {
  try {
    const rows = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'
    `;
    const present = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
    return SPOT_CHECK_COLUMNS
      .filter((target) => !present.has(`${target.table}.${target.column}`))
      .map((target) => `${target.table}.${target.column}`);
  } catch {
    // Unreadable structure is reported by the reachability check, not here.
    return [];
  }
}

async function isSuperuser(): Promise<boolean | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ super: boolean }>>`
      SELECT rolsuper AS "super" FROM pg_roles WHERE rolname = current_user
    `;
    return rows[0]?.super ?? null;
  } catch { return null; }
}

/** True when pg_trgm is not installed yet, so a pending update would need to install it. */
async function pgTrgmMissing(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS count FROM pg_extension WHERE extname = 'pg_trgm'
    `;
    return Number(rows[0]?.count ?? 0) === 0;
  } catch { return false; }
}

async function backupSettings() {
  try { return await BackupSettingsStore.load(); } catch { return {} as Awaited<ReturnType<typeof BackupSettingsStore.load>>; }
}

