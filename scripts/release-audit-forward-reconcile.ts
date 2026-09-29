import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

async function main() {
  const report = JSON.parse(fs.readFileSync('.claude/pre-release-audit/evidence/recovery-rehearsal.json', 'utf8'));
  const migratedName: string = report.database;
  const match = /^hc_audit_test_recovery_(\d{14})$/.exec(migratedName);
  if (!match) throw new Error('Recovery target is not a disposable audit database');
  const baselineName = `hc_audit_test_recovery_baseline_${match[1]}`;
  const archive = path.resolve(`e2e/.runtime/recovery-${match[1]}.backup`);
  if (!fs.existsSync(archive)) throw new Error('Matching recovery backup is missing');
  const source = new URL(dotenv.parse(fs.readFileSync('backend/.env')).DATABASE_URL);
  if (source.pathname.slice(1) !== 'homeconnect') throw new Error('Unexpected source URL; no database was changed');
  const adminUrl = new URL(source); adminUrl.pathname = '/postgres';
  const baselineUrl = new URL(source); baselineUrl.pathname = `/${baselineName}`;
  const migratedUrl = new URL(source); migratedUrl.pathname = `/${migratedName}`;
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
  let baseline: PrismaClient | undefined;
  let migrated: PrismaClient | undefined;
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${baselineName}"`);
    const restore = spawnSync('D:/Program Files/PostgreSQL/18/bin/pg_restore.exe', [
      '--host', source.hostname, '--port', source.port || '5432', '--username', decodeURIComponent(source.username),
      '--no-owner', '--no-acl', '--exit-on-error', '--dbname', baselineName, archive,
    ], { env: { ...process.env, PGPASSWORD: decodeURIComponent(source.password) }, encoding: 'utf8', windowsHide: true, timeout: 180000 });
    if (restore.status !== 0) throw new Error(`Baseline restore failed (${restore.status}): ${(restore.stderr || '').slice(-500)}`);
    baseline = new PrismaClient({ datasources: { db: { url: baselineUrl.toString() } } });
    migrated = new PrismaClient({ datasources: { db: { url: migratedUrl.toString() } } });
    const names = await baseline.$queryRawUnsafe<{ tablename: string }[]>(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
    );
    const differences: string[] = [];
    const checked: string[] = [];
    for (const { tablename } of names) {
      if (tablename === '_prisma_migrations' || tablename === '_thermal_template_reconcile_notes') continue;
      const quoted = `"${tablename.replaceAll('"', '""')}"`;
      const where = tablename === 'pricing_card_templates'
        ? ` WHERE id <> '20000000-0000-4000-8000-000000000005'::uuid`
        : '';
      const sql = `SELECT count(*)::int AS count, md5(COALESCE(string_agg(row_to_json(t)::text, '' ORDER BY row_to_json(t)::text), '')) AS hash FROM (SELECT * FROM ${quoted}${where}) t`;
      const [before] = await baseline.$queryRawUnsafe<{ count: number; hash: string }[]>(sql);
      const [after] = await migrated.$queryRawUnsafe<{ count: number; hash: string }[]>(sql);
      checked.push(tablename);
      if (before.count !== after.count || before.hash !== after.hash) differences.push(tablename);
    }
    const [beforeTemplate] = await baseline.$queryRawUnsafe<{ w: string; h: string; config: unknown }[]>(
      `SELECT "cardWidthMm"::text AS w, "cardHeightMm"::text AS h, config FROM pricing_card_templates WHERE id='20000000-0000-4000-8000-000000000005'::uuid`
    );
    const [afterTemplate] = await migrated.$queryRawUnsafe<{ w: string; h: string; config: unknown }[]>(
      `SELECT "cardWidthMm"::text AS w, "cardHeightMm"::text AS h, config FROM pricing_card_templates WHERE id='20000000-0000-4000-8000-000000000005'::uuid`
    );
    const notes = await migrated.$queryRawUnsafe<{ outcome: string; diffFields: string[] }[]>(
      `SELECT outcome, "diffFields" FROM "_thermal_template_reconcile_notes" ORDER BY id`
    );
    const [migration] = await migrated.$queryRawUnsafe<{ checksum: string; finished_at: Date | null }[]>(
      `SELECT checksum, finished_at FROM "_prisma_migrations" WHERE migration_name='20260928010000_reconcile_thermal_template_variants' ORDER BY started_at DESC LIMIT 1`
    );
    const result = {
      baselineDatabase: baselineName,
      migratedDatabase: migratedName,
      checkedTables: checked.length,
      changedBusinessTables: differences,
      thermalBefore: beforeTemplate ? { width: beforeTemplate.w, height: beforeTemplate.h } : null,
      thermalAfter: afterTemplate ? { width: afterTemplate.w, height: afterTemplate.h } : null,
      thermalUnchanged: JSON.stringify(beforeTemplate) === JSON.stringify(afterTemplate),
      outcomes: notes.map((note) => ({ outcome: note.outcome, diffFields: note.diffFields })),
      forwardMigrationRecorded: Boolean(migration?.finished_at),
    };
    fs.writeFileSync('.claude/pre-release-audit/evidence/forward-reconcile-restored.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    if (differences.length || !migration?.finished_at || notes.length !== 1) process.exitCode = 1;
  } finally {
    await baseline?.$disconnect();
    await migrated?.$disconnect();
    await admin.$disconnect();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
