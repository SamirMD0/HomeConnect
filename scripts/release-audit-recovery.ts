import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync, spawn } from 'child_process';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import {
  MigrationExecutor,
  MigrationClient,
} from '../backend/src/features/maintenance/migration-executor';
const state = JSON.parse(fs.readFileSync('e2e/.runtime/databases.json', 'utf8'));
const source = new URL(dotenv.parse(fs.readFileSync('backend/.env')).DATABASE_URL);
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const name = `hc_audit_test_recovery_${stamp}`;
const target = new URL(source);
target.pathname = `/${name}`;
const adminUrl = new URL(source);
adminUrl.pathname = '/postgres';
const directory = '.claude/pre-release-audit/evidence';
async function main() {
  if (!/^hc_audit_test_recovery_\d{14}$/.test(name)) throw new Error('Unsafe target');
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.$disconnect();
  }
  const pg = 'D:/Program Files/PostgreSQL/18/bin';
  const common = [
    '--host',
    source.hostname,
    '--port',
    source.port || '5432',
    '--username',
    decodeURIComponent(source.username),
  ];
  const archive = path.resolve(`e2e/.runtime/recovery-${stamp}.backup`);
  const run = (exe: string, args: string[], label: string) => {
    const start = Date.now();
    const r = spawnSync(path.join(pg, exe), args, {
      env: { ...process.env, PGPASSWORD: decodeURIComponent(source.password) },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 180000,
    });
    fs.writeFileSync(`${directory}/recovery-${label}.log`, `${r.stdout || ''}\n${r.stderr || ''}`);
    if (r.status !== 0) throw new Error(`${label} failed: ${r.status}`);
    return Date.now() - start;
  };
  const dumpMs = run(
    'pg_dump.exe',
    [
      ...common,
      '--format=custom',
      '--no-owner',
      '--no-acl',
      '--file',
      archive,
      source.pathname.slice(1),
    ],
    'dump'
  );
  const verifyMs = run('pg_restore.exe', ['--list', archive], 'verify');
  const restoreMs = run(
    'pg_restore.exe',
    [...common, '--no-owner', '--no-acl', '--exit-on-error', '--dbname', name, archive],
    'restore'
  );
  const db = new PrismaClient({ datasources: { db: { url: target.toString() } } });
  let migrationStatus, migrationMs;
  try {
    const start = Date.now();
    await MigrationExecutor.applyPending(db as unknown as MigrationClient);
    migrationStatus = await MigrationExecutor.status(db as unknown as MigrationClient);
    migrationMs = Date.now() - start;
  } finally {
    await db.$disconnect();
  }
  const started = Date.now();
  const backend = spawn(process.execPath, ['dist/server/backend/src/index.js'], {
    env: {
      ...process.env,
      DATABASE_URL: target.toString(),
      JWT_SECRET: state.JWT_SECRET,
      JWT_REFRESH_SECRET: state.JWT_REFRESH_SECRET,
      PORT: '4511',
      HOST: '127.0.0.1',
      NODE_ENV: 'production',
      LOG_DIR: path.resolve('e2e/.runtime/recovery-logs'),
      HOME_CONNECT_USER_DATA: path.resolve('e2e/.runtime/recovery-data'),
      HOME_CONNECT_STARTUP_TRACE: '1',
    },
    windowsHide: true,
    stdio: 'ignore',
  });
  let ready = false;
  try {
    while (Date.now() - started < 45000) {
      try {
        const r = await fetch('http://127.0.0.1:4511/api/v1/health');
        const b = await r.json();
        if (b.data?.database === 'connected') {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  } finally {
    backend.kill();
  }
  const result = {
    checkedAt: new Date().toISOString(),
    database: name,
    dumpMs,
    verifyMs,
    restoreMs,
    migrationMs,
    backendReady: ready,
    backendReadinessMs: Date.now() - started,
    archiveBytes: fs.statSync(archive).size,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),
    pending: migrationStatus.pending,
    failed: migrationStatus.failed,
    mismatched: migrationStatus.mismatched,
  };
  fs.writeFileSync(`${directory}/recovery-rehearsal.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (!ready || result.pending.length || result.failed.length || result.mismatched.length)
    process.exitCode = 1;
}
main().catch((e) => {
  console.error(e.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[REDACTED]'));
  process.exitCode = 1;
});
