import path from 'node:path';

// spawn cannot execute a native binary through Electron's virtual ASAR path.
// The CLI itself can remain archived; explicitly point it at the unpacked engine.
export function migrationEnvironment(prismaEntry: string, databaseUrl: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ELECTRON_RUN_AS_NODE: '1', DATABASE_URL: databaseUrl,
    PRISMA_HIDE_UPDATE_MESSAGE: '1' };
  if (/[\\/]app\.asar[\\/]/i.test(prismaEntry)) {
    const engine = path.resolve(path.dirname(prismaEntry), '../../@prisma/engines/schema-engine-windows.exe');
    env.PRISMA_SCHEMA_ENGINE_BINARY = engine.replace(/([\\/])app\.asar([\\/])/i, '$1app.asar.unpacked$2');
  }
  return env;
}

export function safeMigrationError(output: string, databaseUrl: string): string {
  let safe = output.split(databaseUrl).join('[DATABASE_URL REDACTED]');
  try {
    const password = new URL(databaseUrl).password;
    if (password) {
      safe = safe.split(password).join('[REDACTED]').split(decodeURIComponent(password)).join('[REDACTED]');
    }
  } catch { /* A malformed URL is diagnosed by Prisma. */ }
  return safe.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[DATABASE_URL REDACTED]')
    .replace(/\x1b\[[0-9;]*m/g, '').trim().slice(-4000);
}
