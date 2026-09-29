import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const BACKEND_PORT = 4311;
const FRONTEND_PORT = 4312;
const HEALTH_URL = `http://127.0.0.1:${BACKEND_PORT}/api/v1/health`;
const PROCESS_RECORD = path.resolve('e2e/.runtime/managed-server-pids.json');

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (open: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(1000, () => finish(false));
  });
}

async function backendReady(): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  // No shell, npx wrapper, detached child, or Windows taskkill. Playwright's
  // built-in webServer uses taskkill /T /F on Windows; that operation is denied
  // in restricted environments and leaves its teardown promise unresolved.
  if (await portOpen(BACKEND_PORT) || await portOpen(FRONTEND_PORT))
    throw new Error('Audit ports 4311/4312 are already occupied; refusing to reuse an unknown server.');

  // The regular production build points at port 3001. Build the exact source
  // under test for the isolated audit backend so `npx playwright test` works
  // after any prior production build, without relying on a hidden manual step.
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const build = spawnSync(process.execPath, [npmCli, 'run', 'build'], {
    cwd: process.cwd(),
    env: { ...process.env, VITE_API_URL: `http://127.0.0.1:${BACKEND_PORT}/api/v1` },
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  fs.writeFileSync(path.resolve('e2e/.runtime/playwright-build.log'), `${build.stdout ?? ''}${build.stderr ?? ''}`);
  if (build.error || build.status !== 0)
    throw new Error(`Audit build failed (${build.status}): ${build.error?.message ?? String(build.stderr).slice(-2000)}`);

  const server = spawn(process.execPath, ['--import', 'tsx', 'e2e/server.ts'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    windowsHide: true,
  });
  let backendPid: number | undefined;
  let launchError: Error | undefined;
  let exitResult: { code: number | null; signal: NodeJS.Signals | null } | undefined;
  const exited = new Promise<void>((resolve) => {
    server.once('exit', (code, signal) => {
      exitResult = { code, signal };
      resolve();
    });
  });
  server.once('error', (error) => { launchError = error; });
  server.on('message', (message: unknown) => {
    if (!message || typeof message !== 'object') return;
    const report = message as { type?: string; backendPid?: number };
    if (report.type === 'audit-server-pids' && Number.isInteger(report.backendPid))
      backendPid = report.backendPid;
  });

  const shutdown = async () => {
    if (!exitResult && server.connected) server.send('shutdown');
    const stopped = await Promise.race([exited.then(() => true), pause(10000).then(() => false)]);
    if (!stopped) {
      // Fallback targets only the two PIDs this setup spawned. Never enumerate
      // or kill an unrelated Node process just because it shares a port/name.
      if (backendPid && processAlive(backendPid)) process.kill(backendPid);
      server.kill();
      await Promise.race([exited, pause(5000)]);
      throw new Error('Audit server ignored IPC shutdown; owned children were force-stopped.');
    }
    if (exitResult?.code !== 0)
      throw new Error(`Audit server exited unexpectedly: ${JSON.stringify(exitResult)}`);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (!(await portOpen(BACKEND_PORT)) && !(await portOpen(FRONTEND_PORT)) && (!backendPid || !processAlive(backendPid))) {
        fs.writeFileSync(PROCESS_RECORD, JSON.stringify({ serverPid: server.pid, backendPid, cleanExit: true }, null, 2));
        return;
      }
      await pause(250);
    }
    throw new Error(`Audit server teardown left a listener or backend child alive (backend PID ${backendPid ?? 'unknown'}).`);
  };

  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (launchError || exitResult) throw launchError ?? new Error(`Audit server exited before readiness: ${JSON.stringify(exitResult)}`);
    if (await portOpen(FRONTEND_PORT) && await backendReady()) return shutdown;
    await pause(500);
  }
  if (server.connected) server.send('shutdown');
  await Promise.race([exited, pause(10000)]);
  throw new Error('Audit server did not become ready within 90 seconds.');
}
