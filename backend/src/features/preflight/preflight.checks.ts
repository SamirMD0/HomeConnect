import fs from 'fs';
import net from 'net';
import { parsePostgresConnectionString } from '../backup/postgres-url';
import { PostgresToolDiscovery } from '../backup/postgres-tools';
import { fail, pass, PreflightCheckResult, warn } from './preflight.types';

/**
 * The individual preflight checks.
 *
 * Each one is a pure-ish function taking its inputs explicitly rather than
 * reaching for globals, so every failure mode can be tested without a database,
 * a filesystem, or a socket. The service in `preflight.service.ts` supplies the
 * real inputs.
 */

const REQUIRED_VARS = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'] as const;

/** Characters that must be percent-encoded in a URL userinfo section. */
const MUST_ENCODE: Array<{ char: string; encoded: string }> = [
  { char: '@', encoded: '%40' },
  { char: '/', encoded: '%2F' },
  { char: '#', encoded: '%23' },
  { char: '?', encoded: '%3F' },
];

export function checkEnvFile(envPath: string | null, exists: (path: string) => boolean = fs.existsSync): PreflightCheckResult {
  const title = 'Configuration file';
  if (!envPath) {
    return fail('ENV_FILE', title, 'No configuration file path is set.',
      'Set BACKEND_ENV_FILE, or run Setup-HomeConnect.ps1 from the setup bundle.');
  }
  if (!exists(envPath)) {
    return fail('ENV_FILE', title, `Configuration file not found at ${envPath}.`,
      'Run Setup-HomeConnect.ps1 from the setup bundle. It creates this file.');
  }
  return pass('ENV_FILE', title, `Found at ${envPath}.`);
}

export function checkRequiredVars(env: NodeJS.ProcessEnv): PreflightCheckResult {
  const title = 'Required settings';
  const missing = REQUIRED_VARS.filter((name) => !env[name]?.trim());
  if (missing.length) {
    return fail('REQUIRED_VARS', title, `Missing from production.env: ${missing.join(', ')}.`,
      'Re-run the setup script — it regenerates the missing entries.');
  }
  // Values are never echoed; presence is all the operator needs to see.
  return pass('REQUIRED_VARS', title, `All ${REQUIRED_VARS.length} required settings are present.`);
}

export function checkDatabaseUrlParses(databaseUrl: string | undefined): PreflightCheckResult {
  const title = 'Database address';
  if (!databaseUrl) {
    return fail('DATABASE_URL_PARSES', title, 'DATABASE_URL is not set.', 'Re-run the setup script.');
  }
  try {
    const info = parsePostgresConnectionString(databaseUrl);
    // Host, port and database only — never the username or password.
    return pass('DATABASE_URL_PARSES', title, `${info.database} on ${info.host}:${info.port}.`);
  } catch (error) {
    return fail('DATABASE_URL_PARSES', title,
      error instanceof Error ? error.message : 'DATABASE_URL could not be read.',
      'Check DATABASE_URL in production.env. It must look like postgresql://user:password@localhost:5433/homeconnect.');
  }
}

/**
 * The documented pitfall: a password containing `@` splits the URL early, so the
 * app reads a nonsense host and reports a confusing connection error. `new URL`
 * does not reject it, which is why this is its own check rather than relying on
 * the parse above.
 */
export function checkPasswordEncoding(databaseUrl: string | undefined): PreflightCheckResult {
  const title = 'Password encoding';
  if (!databaseUrl) return fail('PASSWORD_ENCODING', title, 'DATABASE_URL is not set.', 'Re-run the setup script.');

  const schemeEnd = databaseUrl.indexOf('://');
  if (schemeEnd === -1 || databaseUrl.lastIndexOf('@') === -1) {
    return pass('PASSWORD_ENCODING', title, 'No credentials embedded in the connection string.');
  }

  // `/`, `#` and `?` terminate the authority, so a raw one makes the whole URL
  // unparseable. Naming the character here turns an opaque parse error into an
  // instruction. `@` is different — see below.
  if (!parses(databaseUrl)) {
    const userinfoRegion = databaseUrl.slice(schemeEnd + 3, databaseUrl.lastIndexOf('@'));
    const offender = MUST_ENCODE.find((candidate) => candidate.char !== '@' && userinfoRegion.includes(candidate.char));
    if (offender) return encodingFailure(offender);
    // Malformed for some other reason; the address check reports that.
    return pass('PASSWORD_ENCODING', title, 'Password encoding could not be assessed.');
  }

  // Greedy up to the LAST `@` inside the authority. A lazy match would stop at
  // the first one — precisely the character being hunted — so the check would
  // pass exactly the URLs it exists to reject. `[^/?#]` keeps the match inside
  // the authority so a path or query containing `@` cannot extend it.
  const match = /^[^:]+:\/\/([^/?#]*)@/.exec(databaseUrl);
  if (!match) return pass('PASSWORD_ENCODING', title, 'No credentials embedded in the connection string.');

  const [, userinfo] = match;
  const separator = userinfo.indexOf(':');
  if (separator === -1) return pass('PASSWORD_ENCODING', title, 'No password embedded in the connection string.');

  // Node's URL splits at the last `@` and tolerates this, but Prisma's own
  // parser and psql split at the first — so the app connects somewhere else
  // entirely while the string looks fine. Hence its own check.
  if (userinfo.slice(separator + 1).includes('@')) return encodingFailure(MUST_ENCODE[0]);

  return pass('PASSWORD_ENCODING', title, 'Password is safely encoded.');
}

function encodingFailure(offender: { char: string; encoded: string }): PreflightCheckResult {
  return fail('PASSWORD_ENCODING', 'Password encoding',
    `The database password contains "${offender.char}", which breaks the connection string.`,
    `Write it as "${offender.encoded}" in DATABASE_URL. A password "pa${offender.char}ss" becomes "pa${offender.encoded}ss".`);
}

function parses(databaseUrl: string): boolean {
  try { new URL(databaseUrl); return true; } catch { return false; }
}

export function checkDatabaseReachable(probe: { ok: boolean; error?: string }, host: string, port: string): PreflightCheckResult {
  const title = 'PostgreSQL connection';
  if (probe.ok) return pass('DATABASE_REACHABLE', title, `Connected to ${host}:${port}.`);
  return fail('DATABASE_REACHABLE', title,
    `Could not reach PostgreSQL at ${host}:${port}${probe.error ? ` — ${probe.error}` : ''}.`,
    'Open Services and start the PostgreSQL service (its name begins "postgresql-x64"), then retry. If it is running, check the port in DATABASE_URL.');
}

export function checkDatabaseName(expected: string, actual: string | null): PreflightCheckResult {
  const title = 'Database name';
  if (!actual) {
    return fail('DATABASE_NAME', title, `Database "${expected}" was not found.`,
      `Run the setup script — it creates "${expected}" if missing. Your existing data is not affected.`);
  }
  if (actual !== expected) {
    return warn('DATABASE_NAME', title, `Connected to "${actual}" but DATABASE_URL names "${expected}".`,
      'Confirm DATABASE_URL points at the intended database before applying any update.');
  }
  return pass('DATABASE_NAME', title, `Connected to "${actual}".`);
}

/**
 * `pg_trgm` is an untrusted extension, so installing it needs a superuser. A
 * non-superuser connection can run every other migration and then fail on that
 * one, half-way through — the exact half-applied state this feature exists to
 * prevent. Detect it before anything is applied.
 */
export function checkExtensionPrivilege(isSuperuser: boolean | null, pendingNeedsExtension: boolean): PreflightCheckResult {
  const title = 'Database permissions';
  if (isSuperuser === null) {
    return warn('EXTENSION_PRIVILEGE', title, 'Could not determine the database user\'s permissions.',
      'If a database update fails with a permission error, re-run the setup script as the postgres user.');
  }
  if (isSuperuser) return pass('EXTENSION_PRIVILEGE', title, 'The database user can install extensions.');
  if (!pendingNeedsExtension) {
    return warn('EXTENSION_PRIVILEGE', title, 'The database user cannot install extensions.',
      'No pending update needs one right now, but a future update may. Consider re-running setup as postgres.');
  }
  return fail('EXTENSION_PRIVILEGE', title,
    'A pending database update installs a PostgreSQL extension, which this database user is not allowed to do.',
    'Re-run Setup-HomeConnect.ps1 using the postgres superuser account, then apply the update again.');
}

export function checkRequiredTables(missing: string[]): PreflightCheckResult {
  const title = 'Database structure';
  if (!missing.length) return pass('REQUIRED_TABLES', title, 'All expected tables and columns are present.');
  return fail('REQUIRED_TABLES', title, `The database is missing: ${missing.join(', ')}.`,
    'A bundled repair fixes this. Sign in as an administrator and open Settings → Maintenance.');
}

export function checkPgClientTools(settings: Parameters<typeof PostgresToolDiscovery.discover>[0]): PreflightCheckResult {
  const title = 'PostgreSQL tools';
  try {
    const tools = PostgresToolDiscovery.discover(settings);
    if (!tools.pgDumpPath) {
      return warn('PG_CLIENT_TOOLS', title, 'pg_dump was not found, so backups cannot run.',
        'Set the PostgreSQL bin folder in Settings → Backup. Repairs stay disabled until a backup is possible.');
    }
    return pass('PG_CLIENT_TOOLS', title, 'pg_dump is available, so a backup can be taken before any repair.');
  } catch (error) {
    return warn('PG_CLIENT_TOOLS', title,
      error instanceof Error ? error.message : 'PostgreSQL tools could not be located.',
      'Set the PostgreSQL bin folder in Settings → Backup.');
  }
}

export function checkPortsFree(busyPorts: number[]): PreflightCheckResult {
  const title = 'Application ports';
  if (!busyPorts.length) return pass('PORTS_FREE', title, 'Ports 3001 and 3002 are available.');
  return fail('PORTS_FREE', title, `Port ${busyPorts.join(' and ')} already in use.`,
    'Close any other HomeConnect window. If that does not help, restart Windows.');
}

/** TCP reachability probe. Kept here so the service has no socket code of its own. */
export function probeTcp(host: string, port: number, timeoutMs = 3000): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const settle = (result: { ok: boolean; error?: string }) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => settle({ ok: true }));
    socket.once('timeout', () => settle({ ok: false, error: 'timed out' }));
    socket.once('error', (error: NodeJS.ErrnoException) => settle({ ok: false, error: error.code ?? error.message }));
    socket.connect(port, host);
  });
}
