import { spawn, ChildProcess } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const HOST = '127.0.0.1';
const BACKEND_PORT = '3001';
const FRONTEND_PORT = '3002';
const BACKEND_URL = `http://${HOST}:${BACKEND_PORT}/api/v1/health`;
const FRONTEND_URL = `http://${HOST}:${FRONTEND_PORT}`;
const READY_TIMEOUT_MS = 60_000;
const CHECK_ONLY = process.env.ELECTRON_DEV_CHECK_ONLY === '1';
// The backend has ~400 TypeScript source files; tsx transpiles each on first
// import, which on Windows pushes the full module graph to a minute or more.
// esbuild bundles our own source to a single CJS file in a couple of seconds
// and keeps node_modules external, so Node starts the whole backend in ~3s.
const BACKEND_BUNDLE = path.resolve('dist/dev/backend.cjs');
const BACKEND_SRC_DIR = path.resolve('backend/src');

const children: ChildProcess[] = [];
let shuttingDown = false;

async function main() {
  // `npm run dev` is still useful for browser-only work, and developers often
  // leave it running before opening Electron. Reuse healthy services instead
  // of starting duplicates that immediately die with EADDRINUSE.
  // Serial, not parallel: Vite's dep optimizer and the backend's startup each
  // peg a CPU core, so running them together on Windows blows past any
  // reasonable readiness window.
  if (!await canReach(BACKEND_URL)) await ensureBackendBundle();
  const backend = await canReach(BACKEND_URL)
    ? null
    : startProcess('backend', process.execPath, [BACKEND_BUNDLE], {
        HOST,
        PORT: BACKEND_PORT,
        NODE_ENV: 'development',
        FRONTEND_URL,
        CORS_ORIGINS: FRONTEND_URL,
      });
  await waitForUrl(BACKEND_URL, READY_TIMEOUT_MS, 'Development Express backend');

  const frontend = await canReach(FRONTEND_URL)
    ? null
    : startProcess('frontend', process.execPath, [
        'node_modules/vite/bin/vite.js',
        'frontend',
        '--config',
        'frontend/vite.config.ts',
        '--host',
        HOST,
        '--port',
        FRONTEND_PORT,
      ]);
  await waitForUrl(FRONTEND_URL, READY_TIMEOUT_MS, 'Vite frontend');

  if (CHECK_ONLY) {
    console.log('Electron dev dependencies are ready.');
    shutdownOwned(backend, frontend);
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
    shutdownOwned(backend, frontend);
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

/**
 * Rebuilds the dev backend bundle when it is missing or any backend source
 * file is newer than the output. Keeps node_modules external, so the file
 * stays small and Node resolves native/binary packages at runtime the same
 * way the tsx-based script used to.
 */
async function ensureBackendBundle(): Promise<void> {
  const outMtime = tryMtime(BACKEND_BUNDLE);
  const newestSrcMtime = newestMtimeIn(BACKEND_SRC_DIR);
  if (outMtime !== null && newestSrcMtime !== null && outMtime >= newestSrcMtime) return;

  console.log('[backend] bundling with esbuild…');
  const started = Date.now();
  await fs.promises.mkdir(path.dirname(BACKEND_BUNDLE), { recursive: true });
  await runOnce('backend-bundle', process.execPath, [
    'node_modules/esbuild/bin/esbuild',
    'backend/src/index.ts',
    '--bundle',
    '--platform=node',
    '--target=node20',
    '--format=cjs',
    '--packages=external',
    `--outfile=${BACKEND_BUNDLE}`,
    '--log-level=error',
  ]);
  console.log(`[backend] bundled in ${Date.now() - started}ms`);
}

function tryMtime(file: string): number | null {
  try { return fs.statSync(file).mtimeMs; } catch { return null; }
}

/**
 * Walks the backend source tree once to find the newest modification time.
 * Skips test/spec files because they are not part of the bundle entry graph
 * and would churn the rebuild on every unrelated edit.
 */
function newestMtimeIn(dir: string): number | null {
  let newest = 0;
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) { walk(next); continue; }
      if (!entry.isFile()) continue;
      if (/\.(test|spec)\.[cm]?[tj]sx?$/.test(entry.name)) continue;
      const m = tryMtime(next);
      if (m !== null && m > newest) newest = m;
    }
  };
  try { walk(dir); } catch { return null; }
  return newest > 0 ? newest : null;
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

function shutdownOwned(...specificChildren: Array<ChildProcess | null>) {
  shutdown(...specificChildren.filter((child): child is ChildProcess => child !== null));
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
