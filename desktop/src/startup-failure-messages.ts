/**
 * Turns a raw startup error into something a shop operator can act on.
 *
 * Every message follows the same shape: what happened → why → what to do next.
 * Before this, a failing install showed `DATABASE_UNAVAILABLE` or "did not
 * become ready within 45s" — technically accurate and completely useless to the
 * person standing in front of the machine.
 *
 * Pure and table-driven so every mapping is testable without booting Electron.
 */

export type StartupStep = 'step-config' | 'step-backend' | 'step-db' | 'step-frontend';

export interface StartupFailure {
  /** Which checklist row to mark red. */
  step: StartupStep;
  /** One-line statement of what went wrong. */
  summary: string;
  /** The concrete next action. Never empty. */
  fix: string;
  /** The original text, kept for the diagnostics copy. */
  raw: string;
}

interface Rule {
  match: RegExp;
  step: StartupStep;
  summary: string;
  fix: string;
}

const RULES: Rule[] = [
  {
    match: /production\.env|env file|BACKEND_ENV_FILE|configuration file not found/i,
    step: 'step-config',
    summary: 'The configuration file could not be found or read.',
    fix: 'Run Setup-HomeConnect.ps1 from the setup bundle. It creates the configuration file this app needs.',
  },
  {
    match: /JWT_SECRET|JWT_REFRESH_SECRET|missing.*secret/i,
    step: 'step-config',
    summary: 'A required security setting is missing from the configuration file.',
    fix: 'Re-run Setup-HomeConnect.ps1 — it regenerates the missing entries without touching your data.',
  },
  {
    match: /password.*@|%40|invalid connection string|ERR_INVALID_URL/i,
    step: 'step-config',
    summary: 'The database address in the configuration file cannot be read.',
    fix: 'If the database password contains "@", write it as "%40" in DATABASE_URL. Re-run the setup script to fix this automatically.',
  },
  {
    match: /ECONNREFUSED|DATABASE_UNAVAILABLE|could not connect.*database|connection refused/i,
    step: 'step-db',
    summary: 'PostgreSQL is not accepting connections.',
    fix: 'Open Services in Windows and start the PostgreSQL service (its name begins "postgresql-x64"), then press Retry Startup.',
  },
  {
    match: /database .* does not exist|3D000/i,
    step: 'step-db',
    summary: 'The HomeConnect database does not exist on this machine.',
    fix: 'Run Setup-HomeConnect.ps1 — it creates the database. Your existing data is not affected.',
  },
  {
    match: /password authentication failed|28P01/i,
    step: 'step-db',
    summary: 'PostgreSQL rejected the username or password.',
    fix: 'Re-run Setup-HomeConnect.ps1 and enter the postgres password again.',
  },
  {
    match: /P2022|column .* does not exist|relation .* does not exist/i,
    step: 'step-db',
    summary: 'The database is missing something this version of HomeConnect expects.',
    fix: 'Sign in as an administrator and open Settings → Maintenance. A bundled repair fixes this, and a backup is taken first.',
  },
  {
    match: /EADDRINUSE|port .* in use|already in use/i,
    step: 'step-backend',
    summary: 'Another program is already using a port HomeConnect needs.',
    fix: 'Close any other HomeConnect window. If that does not help, restart Windows and try again.',
  },
  {
    match: /fast-failed|backend .* exited|backend process/i,
    step: 'step-backend',
    summary: 'The HomeConnect server stopped immediately after starting.',
    fix: 'Press Copy Diagnostics and send the result. Open Logs Folder for the full error.',
  },
  {
    match: /did not become ready|timed out|timeout/i,
    step: 'step-backend',
    summary: 'The HomeConnect server did not finish starting in time.',
    fix: 'This is usually a slow or unreachable database. Check that PostgreSQL is running, then press Retry Startup.',
  },
  {
    match: /frontend/i,
    step: 'step-frontend',
    summary: 'The HomeConnect window could not be loaded.',
    fix: 'Press Retry Startup. If it keeps failing, reinstall HomeConnect — no data is lost by reinstalling.',
  },
];

const FALLBACK: Omit<Rule, 'match'> = {
  step: 'step-config',
  summary: 'HomeConnect could not start.',
  fix: 'Press Copy Diagnostics and send the result, then try Retry Startup.',
};

export function describeStartupFailure(error: unknown): StartupFailure {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown startup failure');
  const rule = RULES.find((candidate) => candidate.match.test(raw)) ?? FALLBACK;
  return { step: rule.step, summary: rule.summary, fix: rule.fix, raw };
}

/** Single line for the log pane and the Windows error dialog. */
export function startupFailureText(failure: StartupFailure): string {
  return `${failure.summary} ${failure.fix}`;
}
