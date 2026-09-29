import fs from 'fs';
import net from 'net';
import dotenv from 'dotenv';

/** Resolve the same precedence the backend uses: explicit environment first. */
export function configuredDatabaseUrl(envFilePath: string, explicitUrl = process.env.DATABASE_URL): string | null {
  if (explicitUrl) return explicitUrl;
  try {
    return dotenv.parse(fs.readFileSync(envFilePath, 'utf8')).DATABASE_URL || null;
  } catch {
    // Missing/unreadable configuration is diagnosed by the normal backend path.
    return null;
  }
}

export type DatabasePreflightResult = 'reachable' | 'refused' | 'unknown';

/**
 * Only a definite TCP refusal is actionable here. A timeout, DNS problem or
 * malformed URL stays on the existing backend/health-check diagnostic path.
 * This probe never authenticates or writes to the database.
 */
export function preflightDatabaseConnection(databaseUrl: string | null, timeoutMs = 1500): Promise<DatabasePreflightResult> {
  let parsed: URL;
  try {
    if (!databaseUrl) return Promise.resolve('unknown');
    parsed = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname) return Promise.resolve('unknown');
  } catch {
    return Promise.resolve('unknown');
  }

  return new Promise((resolve) => {
    const socket = net.connect({ host: parsed.hostname, port: Number(parsed.port || 5432), autoSelectFamily: true });
    let settled = false;
    const finish = (result: DatabasePreflightResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.once('connect', () => finish('reachable'));
    socket.once('error', (error: NodeJS.ErrnoException & { errors?: NodeJS.ErrnoException[] }) => {
      const causes = error.errors?.length ? error.errors : [error];
      finish(causes.every((cause) => cause.code === 'ECONNREFUSED') ? 'refused' : 'unknown');
    });
    socket.setTimeout(timeoutMs, () => finish('unknown'));
  });
}
