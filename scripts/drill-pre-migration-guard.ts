import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PostgresToolDiscovery } from '../backend/src/features/backup/postgres-tools';
import { runPreMigrationGuard } from '../desktop/src/pre-migration-guard';
import type { PreMigrationOutcome } from '../desktop/src/pre-migration-guard';

type Scenario = 'same-version' | 'no-pending-migrations' | 'successful-migration' | 'missing-pg-dump' | 'failed-migration';
const scenarios: Scenario[] = ['same-version', 'no-pending-migrations', 'successful-migration', 'missing-pg-dump', 'failed-migration'];
const usage = 'Usage: tsx scripts/drill-pre-migration-guard.ts --database-url postgres://.../drill_db --scenario <name|all>';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function validateFixtureUrl(value: string | undefined): string {
  if (!value) throw new Error('A disposable database URL is required.');
  const url = new URL(value);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/(test|drill|phase\d)/i.test(databaseName)) {
    throw new Error('Refusing a database whose name does not contain test, drill, or phase plus a number.');
  }
  return value;
}

async function seedFixture(databaseUrl: string): Promise<void> {
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    // Mimic a real shop PC: the DB has data AND a populated _prisma_migrations
    // table. Without the baseline row Prisma refuses to run `migrate deploy`
    // against a non-empty schema (P3005 — "database schema is not empty").
    await client.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      id character varying(36) PRIMARY KEY,
      checksum character varying(64) NOT NULL,
      finished_at timestamptz,
      migration_name character varying(255) NOT NULL,
      logs text,
      rolled_back_at timestamptz,
      started_at timestamptz NOT NULL DEFAULT now(),
      applied_steps_count integer NOT NULL DEFAULT 0
    )`);
    await client.$executeRawUnsafe(`INSERT INTO "_prisma_migrations"
      (id, checksum, migration_name, finished_at, applied_steps_count)
      VALUES ('drill-baseline', 'drill', '00000000000000_baseline', now(), 1)
      ON CONFLICT (id) DO NOTHING`);
    await client.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "__hc_drill_payload" (id bigserial PRIMARY KEY, payload text NOT NULL)');
    await client.$executeRawUnsafe(`INSERT INTO "__hc_drill_payload" (payload)
      SELECT md5(random()::text || g::text) || md5(random()::text || g::text) || md5(random()::text || g::text)
      FROM generate_series(1, 40000) AS g`);
  } finally {
    await client.$disconnect();
  }
}

async function runScenario(scenario: Scenario, databaseUrl: string) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'hc-migration-drill-'));
  const userDataDir = path.join(workspace, 'user-data');
  const migrationsDir = path.join(workspace, 'prisma', 'migrations');
  const backupDir = path.join(workspace, 'backups');
  await fs.mkdir(migrationsDir, { recursive: true });
  await fs.mkdir(path.join(userDataDir, 'config'), { recursive: true });
  await fs.copyFile(path.join(process.cwd(), 'backend/prisma/schema.prisma'), path.join(workspace, 'prisma', 'schema.prisma'));
  await fs.writeFile(path.join(migrationsDir, 'migration_lock.toml'), 'provider = "postgresql"\n');
  await fs.writeFile(path.join(userDataDir, 'config', 'last-run-version.txt'), scenario === 'same-version' ? 'drill-1' : 'drill-0');

  if (scenario !== 'same-version' && scenario !== 'no-pending-migrations') {
    const migrationId = `20261001120000_${scenario.replace(/-/g, '_')}_${Date.now()}`;
    const folder = path.join(migrationsDir, migrationId);
    await fs.mkdir(folder);
    await fs.writeFile(path.join(folder, 'migration.sql'), scenario === 'failed-migration'
      ? 'THIS IS DELIBERATELY INVALID SQL;\n'
      : 'CREATE TABLE IF NOT EXISTS "__hc_drill_success" (id integer PRIMARY KEY);\n');
  }
  if (scenario === 'successful-migration' || scenario === 'failed-migration') await seedFixture(databaseUrl);

  const previousPath = process.env.PATH;
  if (scenario === 'missing-pg-dump') process.env.PATH = '';
  let outcome: PreMigrationOutcome;
  try {
    outcome = await runPreMigrationGuard({
      currentVersion: 'drill-1', userDataDir, backupDir, migrationsDir, databaseUrl, isPackaged: true,
      discoverPgDump: scenario === 'missing-pg-dump' ? () => null : () => PostgresToolDiscovery.findTool('pg_dump'),
    });
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }

  const expected = scenario === 'same-version' ? 'same-version'
    : scenario === 'no-pending-migrations' ? 'no-pending-migrations'
    : scenario === 'missing-pg-dump' ? 'BACKUP_TOOL_NOT_FOUND'
    : scenario === 'failed-migration' ? 'MIGRATION_FAILED' : 'migrated';
  const actual = outcome.kind === 'skipped' ? outcome.reason : outcome.kind === 'failed' ? outcome.code : outcome.kind;
  return { scenario, actual, expected, passed: actual === expected, backupPath: 'backupPath' in outcome ? outcome.backupPath : undefined, workspace };
}

async function main() {
  const databaseUrl = validateFixtureUrl(argument('--database-url'));
  const selected = argument('--scenario');
  if (selected !== 'all' && !scenarios.includes(selected as Scenario)) throw new Error('Choose a listed scenario or all.');
  const selectedScenarios = selected === 'all' ? scenarios : [selected as Scenario];
  const results = [];
  for (const scenario of selectedScenarios) {
    const result = await runScenario(scenario, databaseUrl);
    results.push(result);
    process.stdout.write(`${result.passed ? 'PASS' : 'FAIL'} ${scenario}: ${result.actual} (expected ${result.expected})\n`);
  }
  const evidenceDir = path.join(process.cwd(), '.claude', 'pre-release-audit', 'evidence');
  await fs.mkdir(evidenceDir, { recursive: true });
  const evidencePath = path.join(evidenceDir, `pre-migration-drill-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await fs.writeFile(evidencePath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
  process.stdout.write(`Evidence: ${evidencePath}\n`);
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

void main().catch(() => {
  process.stderr.write(`${usage}\nDrill could not complete. Verify the disposable database and PostgreSQL client tools.\n`);
  process.exitCode = 1;
});
