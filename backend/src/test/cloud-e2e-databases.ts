import { isIsolatedTestDatabase } from './database';
export function cloudE2eEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (env.RUN_CLOUD_E2E !== '1') return false;
  if (!isIsolatedTestDatabase(env.DATABASE_URL) || !isIsolatedTestDatabase(env.RELAY_DATABASE_URL))
    throw Error(
      'RUN_CLOUD_E2E requires BOTH DATABASE_URL and RELAY_DATABASE_URL to name isolated test/ci databases.'
    );
  return true;
}
