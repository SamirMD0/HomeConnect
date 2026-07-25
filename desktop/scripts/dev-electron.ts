import { spawn, ChildProcess } from 'child_process';
import http from 'http';

const HOST = '127.0.0.1';
const BACKEND_PORT = '3001';
const FRONTEND_PORT = '3002';
const BACKEND_URL = `http://${HOST}:${BACKEND_PORT}/api/v1/health`;
const FRONTEND_URL = `http://${HOST}:${FRONTEND_PORT}`;
const READY_TIMEOUT_MS = 45_000;
const CHECK_ONLY = process.env.ELECTRON_DEV_CHECK_ONLY === '1';

const children: ChildProcess[] = [];
let shuttingDown = false;

async function main() {
  const backend = startProcess('backend', process.execPath, [
    'node_modules/tsx/dist/cli.mjs',
    'backend/src/index.ts',
  ], {
    HOST,
    PORT: BACKEND_PORT,
    NODE_ENV: 'development',
    FRONTEND_URL,
    CORS_ORIGINS: FRONTEND_URL,
  });
  const frontend = startProcess('frontend', process.execPath, [
    'node_modules/vite/bin/vite.js',
    'frontend',
    '--host',
    HOST,
    '--port',
    FRONTEND_PORT,
  ]);

  await Promise.all([
    waitForUrl(BACKEND_URL, READY_TIMEOUT_MS, 'Express backend'),
    waitForUrl(FRONTEND_URL, READY_TIMEOUT_MS, 'Vite frontend'),
  ]);

  if (CHECK_ONLY) {
    console.log('Electron dev dependencies are ready.');
    shutdown(backend, frontend);
    return;
  }

  await runOnce('electron-compile', process.execPath, [
    'node_modules/typescript/bin/tsc',
    '-p',
    'tsconfig.electron.json',
  ]);

  startProcess('electron', process.execPath, ['node_modules/electron/cli.js', '.'], {
    NODE_ENV: 'development',
    ELECTRON_RUN_AS_NODE: undefined,
    VITE_DEV_SERVER_URL: FRONTEND_URL,
  }).once('exit', () => {
    shutdown(backend, frontend);
  });
}

function startProcess(
  label: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = {}
) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, ...env },
    windowsHide: false,
  });

  children.push(child);
  child.once('exit', (code) => {
    if (!shuttingDown && label !== 'electron') {
      console.error(`[${label}] exited unexpectedly with code ${code ?? 'unknown'}`);
      shutdown();
    }
  });

  return child;
}

function runOnce(label: string, command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
      env: process.env,
    });

    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`[${label}] failed with code ${code ?? 'unknown'}`));
    });
    child.once('error', reject);
  });
}

async function waitForUrl(url: string, timeoutMs: number, label: string) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await canReach(url)) return;
    await delay(500);
  }

  throw new Error(`${label} did not become ready within ${timeoutMs / 1000}s: ${url}`);
}

function canReach(url: string) {
  return new Promise<boolean>((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 500));
    });

    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shutdown(...specificChildren: ChildProcess[]) {
  shuttingDown = true;
  const targets = specificChildren.length > 0 ? specificChildren : children;
  for (const child of targets) {
    if (!child.killed && child.exitCode === null) child.kill();
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  shutdown();
  process.exit(1);
});
