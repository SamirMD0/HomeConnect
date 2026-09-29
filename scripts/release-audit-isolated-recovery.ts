import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { MigrationExecutor, type MigrationClient } from '../backend/src/features/maintenance/migration-executor';

const state = JSON.parse(fs.readFileSync('e2e/.runtime/databases.json', 'utf8'));
const source = new URL(state.urls.browser);
const sourceName = source.pathname.slice(1);
if (!/^hc_audit_test_browser_\d+$/.test(sourceName) || !['localhost', '127.0.0.1'].includes(source.hostname))
  throw new Error('Backup source must be the local isolated browser database');
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const targetName = `hc_audit_test_recovery_isolated_${stamp}`;
const target = new URL(source); target.pathname = `/${targetName}`;
const adminUrl = new URL(source); adminUrl.pathname = '/postgres';
const runtime = path.resolve('e2e/.runtime');
const archive = path.join(runtime, `isolated-recovery-${stamp}.backup`);
const pgBin = process.env.AUDIT_PG_BIN || 'D:/Program Files/PostgreSQL/18/bin';
const port = 4512;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function runPg(exe: string, args: string[]) {
  const result = spawnSync(path.join(pgBin, exe), args, {
    env: { ...process.env, PGPASSWORD: decodeURIComponent(source.password) },
    encoding: 'utf8', windowsHide: true, timeout: 180000, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`${exe} failed (${result.status}): ${(result.stderr || '').slice(-500)}`);
}

async function snapshot(db: PrismaClient) {
  const tables = await db.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename`
  );
  const rows: Record<string, { count: number; hash: string }> = {};
  for (const { tablename } of tables) {
    const quoted = `"${tablename.replaceAll('"', '""')}"`;
    const [row] = await db.$queryRawUnsafe<Array<{ count: number; hash: string }>>(
      `SELECT count(*)::int AS count, md5(COALESCE(string_agg(row_to_json(t)::text, '' ORDER BY row_to_json(t)::text), '')) AS hash FROM (SELECT * FROM ${quoted}) t`
    );
    rows[tablename] = row;
  }
  return rows;
}

async function listening(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
  });
}

async function main() {
  if (await listening()) throw new Error(`Port ${port} is already in use`);
  const original = new PrismaClient({ datasources: { db: { url: source.toString() } } });
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
  let restored: PrismaClient | undefined;
  try {
    const before = await snapshot(original);
    const common = ['--host', source.hostname, '--port', source.port || '5432', '--username', decodeURIComponent(source.username)];
    runPg('pg_dump.exe', [...common, '--format=custom', '--no-owner', '--no-acl', '--file', archive, sourceName]);
    runPg('pg_restore.exe', ['--list', archive]);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${targetName}"`);
    runPg('pg_restore.exe', [...common, '--no-owner', '--no-acl', '--exit-on-error', '--dbname', targetName, archive]);
    restored = new PrismaClient({ datasources: { db: { url: target.toString() } } });
    const applied = await MigrationExecutor.applyPending(restored as unknown as MigrationClient);
    const migration = await MigrationExecutor.status(restored as unknown as MigrationClient);
    const after = await snapshot(restored);
    const changed = Object.keys(before).filter((table) =>
      !after[table] || before[table].count !== after[table].count || before[table].hash !== after[table].hash);
    const added = Object.keys(after).filter((table) => !(table in before));

    const userData = path.join(runtime, `isolated-recovery-data-${stamp}`);
    const started = Date.now();
    const backend = spawn(process.execPath, ['dist/server/backend/src/index.js'], {
      cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env, DATABASE_URL: target.toString(), JWT_SECRET: state.JWT_SECRET,
        JWT_REFRESH_SECRET: state.JWT_REFRESH_SECRET, PORT: String(port), HOST: '127.0.0.1',
        NODE_ENV: 'production', HOME_CONNECT_USER_DATA: userData,
        HOME_CONNECT_CONFIG_DIR: path.join(userData, 'config'),
        BACKEND_ENV_FILE: path.join(userData, 'config', 'production.env'),
        LOG_DIR: path.join(userData, 'logs'), HOME_CONNECT_STARTUP_TRACE: '1',
      },
    });
    let output = '';
    for (const stream of [backend.stdout, backend.stderr]) stream.on('data', (chunk) => {
      output = (output + String(chunk)).slice(-4000);
    });
    let ready = false;
    try {
      // Observe a cold backend import without changing the application's own
      // 45-second desktop deadline. A slow isolated restore remains visible in
      // backendReadinessMs rather than being mistaken for data corruption.
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline) {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`, { signal: AbortSignal.timeout(1000) });
          const body = await response.json();
          if (response.ok && body.data?.database === 'connected') { ready = true; break; }
        } catch { /* not ready yet */ }
        await sleep(250);
      }
    } finally {
      backend.kill();
      await Promise.race([new Promise<void>((resolve) => backend.once('exit', () => resolve())), sleep(5000)]);
    }
    const result = {
      sourceDatabase: sourceName, restoredDatabase: targetName,
      archiveBytes: fs.statSync(archive).size,
      archiveSha256: crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),
      checkedTables: Object.keys(before).length, changedTables: changed, addedTables: added,
      appliedMigrations: applied.length, pending: migration.pending, failed: migration.failed,
      mismatched: migration.mismatched, backendReady: ready, backendReadinessMs: Date.now() - started,
      backendStopped: !(await listening()), backendOutputTail: output.replace(/postgres(?:ql)?:\/\/\S+/g, '[DATABASE_URL REDACTED]'),
    };
    fs.writeFileSync('.claude/pre-release-audit/evidence/isolated-backup-restore.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ ...result, backendOutputTail: '[stored in evidence]' }));
    if (changed.length || added.some((table) => table !== '_thermal_template_reconcile_notes')
      || !ready || !result.backendStopped || migration.pending.length || migration.failed.length || migration.mismatched.length)
      process.exitCode = 1;
  } finally {
    await restored?.$disconnect();
    await original.$disconnect();
    await admin.$disconnect();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[REDACTED]') : error); process.exitCode = 1; });
