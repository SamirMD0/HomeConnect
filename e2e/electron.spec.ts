import {
  test,
  expect,
  _electron as electron,
  ElectronApplication,
  TestInfo,
} from '@playwright/test';
import fs from 'fs';
import path from 'path';
import net from 'net';
const state = JSON.parse(fs.readFileSync('e2e/.runtime/databases.json', 'utf8'));
if (!/^hc_audit_test_browser_\d+$/.test(new URL(state.urls.browser).pathname.slice(1)))
  throw new Error('Unsafe Electron test database');
const packaged = process.env.AUDIT_ELECTRON_EXECUTABLE;
const runId = process.env.AUDIT_ELECTRON_RUN_ID;
const disableGpuForDiagnosis = process.env.AUDIT_ELECTRON_DISABLE_GPU === '1';
if (runId && !/^[a-z0-9_-]+$/i.test(runId)) throw new Error('Unsafe Electron audit run id');
const backendPort = packaged ? 3001 : 4311;
const frontendPort = packaged ? 3002 : 4312;
const frontendOrigin = `http://127.0.0.1:${frontendPort}`;
function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.once('error', () => resolve(false));
    s.setTimeout(1000, () => {
      s.destroy();
      resolve(false);
    });
  });
}
async function launch(name: string, extra: Record<string, string> = {}) {
  expect(
    await listening(backendPort),
    'Backend port must be free; never reuse an existing service'
  ).toBe(false);
  expect(
    await listening(frontendPort),
    'Frontend port must be free; never reuse an existing service'
  ).toBe(false);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );
  delete env.ELECTRON_RUN_AS_NODE;
  // Never inherit a machine's installed-app config into an isolated audit run.
  delete env.BACKEND_ENV_FILE;
  delete env.HOME_CONNECT_CONFIG_DIR;
  const app = await electron.launch({
    ...(packaged ? { executablePath: path.resolve(packaged), args: disableGpuForDiagnosis ? ['--disable-gpu'] : [] } : { args: ['.'] }),
    env: {
      ...env,
      NODE_ENV: 'production',
      DATABASE_URL: state.urls.browser,
      JWT_SECRET: state.JWT_SECRET,
      JWT_REFRESH_SECRET: state.JWT_REFRESH_SECRET,
      HOME_CONNECT_USER_DATA: path.resolve(`e2e/.runtime/electron-${name}${runId ? `-${runId}` : ''}`),
      HOME_CONNECT_BACKEND_PORT: String(backendPort),
      HOME_CONNECT_FRONTEND_PORT: String(frontendPort),
      HOME_CONNECT_STARTUP_TRACE: '1',
      ...extra,
    },
  });
  await app.context().tracing.start({ screenshots: true, snapshots: true, sources: true });
  const environment = await app.evaluate(() => ({
    execArgv: process.execArgv,
    nodeOptions: process.env.NODE_OPTIONS,
    environmentKeys: Object.keys(process.env).filter((k) =>
      /INSPECT|DEBUG|ELECTRON|PLAYWRIGHT|NODE_OPTIONS/i.test(k)
    ),
  }));
  fs.writeFileSync(
    `.claude/pre-release-audit/evidence/electron-environment-${name}.json`,
    JSON.stringify(environment, null, 2)
  );
  return app;
}
async function close(app: ElectronApplication, info: TestInfo) {
  for (const [index, page] of app.windows().entries())
    await page.screenshot({ path: info.outputPath(`window-${index}.png`) });
  await app.context().tracing.stop({ path: info.outputPath('trace.zip') });
  await app.close();
  await expect
    .poll(() => listening(backendPort), { message: 'Backend must stop after Electron closes' })
    .toBe(false);
  await expect
    .poll(() => listening(frontendPort), { message: 'Frontend must stop after Electron closes' })
    .toBe(false);
}
test('compiled Electron cold and warm start: login, database health, clean shutdown', async ({}, info) => {
  const measurements = [];
  for (const label of ['cold-process', 'warm-process']) {
    const started = Date.now();
    const app = await launch(packaged ? 'packaged' : 'compiled');
    const errors: string[] = [];
    app.on('window', (page) => {
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('response', (r) => {
        if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
      });
      page.on('console', (m) => {
        if (
          m.type() === 'error' &&
          !(m.location().url.includes('/auth/refresh') && m.text().includes('401'))
        )
          errors.push(m.text());
      });
    });
    try {
      await expect
        .poll(() => app.windows().some((w) => w.url().startsWith(frontendOrigin)), {
          timeout: 60000,
        })
        .toBe(true);
      const page = app.windows().find((w) => w.url().startsWith(frontendOrigin))!;
      await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
      const health = await app
        .context()
        .request.get(`http://127.0.0.1:${backendPort}/api/v1/health`);
      expect((await health.json()).data.database).toBe('connected');
      measurements.push({ label, loginVisibleMs: Date.now() - started, packaged: !!packaged });
      await page.screenshot({ path: info.outputPath(`${label}.png`) });
      expect(errors).toEqual([]);
    } finally {
      await close(app, info);
    }
  }
  await info.attach('startup-timings', {
    body: Buffer.from(JSON.stringify(measurements, null, 2)),
    contentType: 'application/json',
  });
  fs.writeFileSync(
    `.claude/pre-release-audit/evidence/electron-timings-${packaged ? 'packaged' : 'compiled'}.json`,
    JSON.stringify(measurements, null, 2)
  );
});
test('direct development launch reports missing external backend without 45 second wait', async ({}, info) => {
  const started = Date.now();
  const app = await launch('dev-missing', { NODE_ENV: 'development' });
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByText('The development server is not running.', { exact: true })
    ).toBeVisible();
    expect(Date.now() - started).toBeLessThan(15000);
    await page.screenshot({ path: info.outputPath('dev-failure.png') });
  } finally {
    await close(app, info);
  }
});
test('database unavailable: failure is useful; retry succeeds without orphaned backend', async ({}, info) => {
  const bad = new URL(state.urls.browser);
  bad.port = '1';
  const app = await launch('db-retry', { DATABASE_URL: bad.toString() });
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByText('PostgreSQL is not accepting connections.', { exact: true })
    ).toBeVisible({ timeout: 60000 });
    await expect.poll(() => listening(backendPort)).toBe(false);
    await app.evaluate((_, url) => {
      process.env.DATABASE_URL = url;
    }, state.urls.browser);
    await page.getByRole('button', { name: 'Retry Startup' }).click();
    await expect
      .poll(() => app.windows().some((w) => w.url().startsWith(frontendOrigin)), { timeout: 60000 })
      .toBe(true);
    const main = app.windows().find((w) => w.url().startsWith(frontendOrigin))!;
    await expect(main.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  } finally {
    await close(app, info);
  }
});
test('backend exits early for missing JWT; user can retry', async ({}, info) => {
  const started = Date.now();
  const app = await launch('jwt-missing', { JWT_SECRET: '' });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('button', { name: 'Retry Startup' })).toBeVisible({
      timeout: 30000,
    });
    expect(Date.now() - started).toBeLessThan(30000);
    await expect.poll(() => listening(backendPort)).toBe(false);
    await page.screenshot({ path: info.outputPath('jwt-failure.png') });
  } finally {
    await close(app, info);
  }
});
test('occupied backend port reports conflict and never kills the foreign listener', async ({}, info) => {
  expect(await listening(4513)).toBe(false);
  const foreign = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve) => foreign.listen(4513, '127.0.0.1', resolve));
  try {
    const app = await launch('port-conflict', { HOME_CONNECT_BACKEND_PORT: '4513' });
    try {
      const page = await app.firstWindow();
      await expect(
        page.getByText('Another program is already using a port HomeConnect needs.', {
          exact: true,
        })
      ).toBeVisible();
      expect(await listening(4513)).toBe(true);
    } finally {
      await close(app, info);
    }
  } finally {
    await new Promise<void>((resolve) => foreign.close(() => resolve()));
  }
});
