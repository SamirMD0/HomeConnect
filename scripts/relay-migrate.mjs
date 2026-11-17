import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Prisma 5 migrations need session continuity; runtime keeps the pooled URL.
export function migrationUrl(value) {
  const url = new URL(value);
  if (url.hostname.endsWith('.neon.tech') && url.hostname.includes('-pooler.')) {
    url.hostname = url.hostname.replace('-pooler.', '.');
    url.searchParams.delete('pgbouncer');
  }
  return url.toString();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let url;
  try {
    url = migrationUrl(process.env.RELAY_DATABASE_URL);
  } catch {
    console.error('RELAY_DATABASE_URL must be a valid PostgreSQL connection string.');
    process.exit(1);
  }
  const result = spawnSync(
    process.execPath,
    [
      resolve('node_modules/prisma/build/index.js'),
      'migrate',
      'deploy',
      '--schema',
      'backend/prisma/relay/schema.prisma',
    ],
    { env: { ...process.env, RELAY_DATABASE_URL: url }, stdio: 'inherit', windowsHide: true }
  );
  process.exit(result.status ?? 1);
}
