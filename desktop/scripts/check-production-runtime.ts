import path from 'path';
import { startCompiledBackend } from '../src/backend-process';
import { BACKEND_HEALTH_URL, FRONTEND_ORIGIN, READY_TIMEOUT_MS } from '../src/runtime-config';
import { startStaticFrontendServer } from '../src/static-frontend-server';
import { waitForUrl } from '../src/readiness';

async function main() {
  const appRoot = process.cwd();
  const backend = startCompiledBackend(
    path.join(appRoot, 'dist/server/backend/src/index.js'),
    path.join(appRoot, '.tmp-electron-user-data'),
    appRoot
  );
  const frontend = await startStaticFrontendServer(path.join(appRoot, 'frontend/dist'));

  try {
    await Promise.all([
      waitForUrl(BACKEND_HEALTH_URL, READY_TIMEOUT_MS, 'Compiled Express backend'),
      waitForUrl(FRONTEND_ORIGIN, READY_TIMEOUT_MS, 'Static React frontend'),
    ]);
    console.log('Production local runtime is ready.');
  } finally {
    await new Promise<void>((resolve) => frontend.close(() => resolve()));
    if (backend.exitCode === null) backend.kill();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
