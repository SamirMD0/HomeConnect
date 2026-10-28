/** Isolated 2.0.4 upgrade plus database/application rollback rehearsal. No production writes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { MigrationRunner } from '../backend/src/features/maintenance/migration-runner';
import { MigrationExecutor, type MigrationClient } from '../backend/src/features/maintenance/migration-executor';
import { prepareRollback, rollbackStatePath } from '../desktop/src/update-rollback';
import { safeMigrationError } from '../desktop/src/prisma-migration-runtime';
const { recover } = require('../desktop/src/rollback-helper.cjs');

const root = process.cwd();
const evidence = path.join(root, '.claude', 'pre-release-audit', 'evidence');
const runRoot = path.join(root, 'e2e', '.runtime', `update-recovery-${Date.now()}`);
const pgBin = process.env.AUDIT_PG_BIN || 'D:/Program Files/PostgreSQL/18/bin';
const version = JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version;
const resources = path.join(root, 'release', version, 'win-unpacked', 'resources');
const executable = path.join(path.dirname(resources), 'HomeConnect.exe');
const base = new URL(dotenv.parse(require('node:fs').readFileSync(process.env.REHEARSAL_ENV_FILE || path.join(root, 'backend/.env'))).DATABASE_URL);
const databaseName = `homeconnect_test_update_recovery_${Date.now()}`;
base.searchParams.set('connect_timeout', '30');
const databaseUrl = new URL(base);
databaseUrl.pathname = '/' + databaseName;
const adminUrl = new URL(base);
adminUrl.pathname = '/postgres';
function command(exe: string, args: string[], env = process.env) {
  const result = spawnSync(exe, args, { env, windowsHide: true, encoding: 'utf8', timeout: 300_000, maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Rehearsal command failed (${path.basename(exe)}, ${result.status}): ${safeMigrationError((result.stdout || '') + (result.stderr || ''), databaseUrl.toString())}`);
  return result;
}
async function main() {
  await fs.mkdir(evidence, { recursive: true });
  await fs.mkdir(runRoot, { recursive: true });
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
  console.log('Creating isolated upgrade/recovery database');
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  await admin.$disconnect();
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } } });
  const all = MigrationRunner.readBundled(path.join(root, 'backend/prisma/migrations'));
  console.log('Applying the 2.0.4 baseline to the isolated database');
  const baseline = all.filter((migration) => migration.name <= '20260928010000_reconcile_thermal_template_variants');
  const applied = await MigrationExecutor.applyPending(client as unknown as MigrationClient, baseline);
  if (applied.some((result) => !result.applied)) throw new Error('2.0.4 baseline migrations failed');
  await client.$executeRawUnsafe('CREATE TABLE "__hc_upgrade_payload" (id integer PRIMARY KEY, payload text NOT NULL)');
  await client.$executeRawUnsafe(`INSERT INTO "__hc_upgrade_payload" SELECT g, md5(random()::text) || md5(random()::text) || md5(random()::text) FROM generate_series(1,40000) g`);
  const userData = path.join(runRoot, 'user-data');
  await fs.mkdir(path.join(userData, 'config'), { recursive: true });
  await fs.writeFile(path.join(userData, 'config', 'last-run-version.txt'), '2.0.4');
  const guardProbe = path.join(runRoot, 'packaged-guard.cjs');
  await fs.writeFile(guardProbe, `process.resourcesPath=${JSON.stringify(resources)};const {runPreMigrationGuard}=require(${JSON.stringify(path.join(resources, 'app.asar/dist/electron/desktop/src/pre-migration-guard.js'))});runPreMigrationGuard({currentVersion:${JSON.stringify(version)},userDataDir:${JSON.stringify(userData)},backupDir:${JSON.stringify(path.join(userData, 'backups'))},migrationsDir:${JSON.stringify(path.join(resources, 'prisma/migrations'))},databaseUrl:process.env.DATABASE_URL,isPackaged:true}).then(x=>{console.log(JSON.stringify(x));process.exit(x.kind==='migrated'?0:1)}).catch(()=>process.exit(1));`);
  const guardRun = command(executable, [guardProbe], { ...process.env, ELECTRON_RUN_AS_NODE: '1', DATABASE_URL: databaseUrl.toString() });
  const guardOutcome = JSON.parse(guardRun.stdout.trim().split(/\r?\n/).at(-1)!);
  if (guardOutcome.count !== all.length - baseline.length) throw new Error('Unexpected upgrade migration count');
  console.log(`PASS: packaged 2.0.4 → ${version} applied ${guardOutcome.count} pending migrations`);
  const installDir = path.join(runRoot, 'install-fixture');
  await fs.mkdir(path.join(installDir, 'resources'), { recursive: true });
  await fs.writeFile(path.join(installDir, 'HomeConnect.exe'), 'previous-executable');
  await fs.writeFile(path.join(installDir, 'resources', 'app.asar'), 'previous-archive');
  const state = await prepareRollback({ from: version, to: '2.0.7', installDir, userDataDir: userData,
    envFilePath: path.join(userData, 'config', 'production.env'), databaseUrl: databaseUrl.toString(),
    pgDump: path.join(pgBin, 'pg_dump.exe'), pgRestore: path.join(pgBin, 'pg_restore.exe'), psql: path.join(pgBin, 'psql.exe'),
    launchWatchdog: async () => {}, helperPath: path.join(root, 'desktop/src/rollback-helper.cjs') });
  const before = await client.$queryRawUnsafe<Array<{ hash: string }>>('SELECT md5(string_agg(payload, \'\' ORDER BY id)) hash FROM "__hc_upgrade_payload"');
  await client.$executeRawUnsafe('CREATE TABLE "__hc_failed_update" (id UUID REFERENCES "users"(id))');
  await client.$executeRawUnsafe('UPDATE "__hc_upgrade_payload" SET payload=\'modified\' WHERE id=1');
  await client.$disconnect();
  await fs.writeFile(path.join(installDir, 'resources', 'app.asar'), 'failed-update-archive');
  let relaunched = false;
  await recover(rollbackStatePath(userData), { ...state, databaseMayHaveChanged: true }, {
    skipProcessWait: true, databaseUrl: databaseUrl.toString(), launch: async () => { relaunched = true; },
  });
  const verify = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } } });
  const after = await verify.$queryRawUnsafe<Array<{ hash: string }>>('SELECT md5(string_agg(payload, \'\' ORDER BY id)) hash FROM "__hc_upgrade_payload"');
  const newTable = await verify.$queryRawUnsafe<Array<{ name: string | null }>>('SELECT to_regclass(\'public.__hc_failed_update\')::text name');
  if (before[0].hash !== after[0].hash || newTable[0].name !== null || !relaunched
    || await fs.readFile(path.join(installDir, 'resources', 'app.asar'), 'utf8') !== 'previous-archive') {
    throw new Error('Rollback verification failed');
  }
  console.log('PASS: atomic recovery restored prior data, removed new schema objects, restored app files and relaunched');
  // Prove a failing restore does not drop the working schema or overwrite current data.
  const invalidSql = path.join(runRoot, 'invalid-restore.sql');
  await fs.writeFile(invalidSql, 'THIS IS INVALID SQL;');
  const negative = spawnSync(path.join(pgBin, 'psql.exe'), ['--no-password', '--dbname', databaseUrl.toString(),
    '--single-transaction', '--set', 'ON_ERROR_STOP=1', '--command', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;', '--file', invalidSql],
    { windowsHide: true, stdio: 'ignore' });
  const unchanged = await verify.$queryRawUnsafe<Array<{ hash: string }>>('SELECT md5(string_agg(payload, \'\' ORDER BY id)) hash FROM "__hc_upgrade_payload"');
  if (negative.status === 0 || unchanged[0].hash !== before[0].hash) throw new Error('Failed restore was not atomic');
  await verify.$disconnect();
  console.log('PASS: deliberately failed restore left original data and schema intact');
  await fs.writeFile(path.join(evidence, 'update-recovery-rehearsal.json'), JSON.stringify({ version, databaseName,
    baselineMigrations: baseline.length, pendingMigrationsApplied: guardOutcome.count, backupCreated: !!guardOutcome.backupPath,
    dataHashRestored: true, newObjectsRemoved: true, previousAppRestored: true, relaunched,
    failedRestoreLeftDatabaseIntact: true, timestamp: new Date().toISOString() }, null, 2));
}
void main().catch((error) => { console.error(error.message); process.exit(1); });
