/**
 * Preflight is the read-only health report shown before the app opens.
 *
 * Two rules define it:
 *   1. It never writes to the database. Detection only; fixing is a separate,
 *      admin-approved action in Maintenance.
 *   2. Every result carries a plain-English `fix`. A status with no stated next
 *      step is what today's `DATABASE_UNAVAILABLE` jargon already does, and the
 *      whole point is to stop shipping that.
 */

export type PreflightStatus = 'PASS' | 'WARN' | 'FAIL' | 'SKIPPED';

export type PreflightCheckId =
  | 'ENV_FILE'
  | 'REQUIRED_VARS'
  | 'DATABASE_URL_PARSES'
  | 'PASSWORD_ENCODING'
  | 'DATABASE_REACHABLE'
  | 'DATABASE_NAME'
  | 'MIGRATION_STATUS'
  | 'REPAIR_STATUS'
  | 'REQUIRED_TABLES'
  | 'APP_DB_COMPATIBILITY'
  | 'PG_CLIENT_TOOLS'
  | 'PORTS_FREE'
  | 'EXTENSION_PRIVILEGE';

export interface PreflightCheckResult {
  id: PreflightCheckId;
  /** Short human title, shown as the row label in the startup monitor. */
  title: string;
  status: PreflightStatus;
  /** What was found. Never contains a password or a full connection string. */
  detail: string;
  /** What to do about it. Empty only when status is PASS. */
  fix: string;
}

export interface PreflightReport {
  /** Worst status across all checks — what the startup monitor shows at the top. */
  status: PreflightStatus;
  /** True when nothing FAILed, so the app may open. WARNs do not block. */
  canStart: boolean;
  checkedAt: string;
  appVersion: string;
  checks: PreflightCheckResult[];
}

export const pass = (id: PreflightCheckId, title: string, detail: string): PreflightCheckResult =>
  ({ id, title, status: 'PASS', detail, fix: '' });

export const warn = (id: PreflightCheckId, title: string, detail: string, fix: string): PreflightCheckResult =>
  ({ id, title, status: 'WARN', detail, fix });

export const fail = (id: PreflightCheckId, title: string, detail: string, fix: string): PreflightCheckResult =>
  ({ id, title, status: 'FAIL', detail, fix });

export const skipped = (id: PreflightCheckId, title: string, detail: string): PreflightCheckResult =>
  ({ id, title, status: 'SKIPPED', detail, fix: '' });

/** FAIL beats WARN beats PASS; SKIPPED never worsens the verdict. */
export function worstStatus(checks: PreflightCheckResult[]): PreflightStatus {
  if (checks.some((check) => check.status === 'FAIL')) return 'FAIL';
  if (checks.some((check) => check.status === 'WARN')) return 'WARN';
  return 'PASS';
}
