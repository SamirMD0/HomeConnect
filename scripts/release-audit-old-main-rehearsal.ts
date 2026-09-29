import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { MigrationExecutor } from '../backend/src/features/maintenance/migration-executor';
import { MigrationRunner } from '../backend/src/features/maintenance/migration-runner';

async function main() {
  const manifest = JSON.parse(fs.readFileSync('e2e/.runtime/databases.json', 'utf8'));
  const sourceUrl = new URL(manifest.urls.ci);
  if (!/^hc_audit_test_ci(?:_phase4_phase5_phase6)?_\d+$/.test(sourceUrl.pathname.slice(1))) {
    throw new Error('Manifest does not point at an isolated audit CI database');
  }
  const targetName = `hc_audit_test_oldmain_${Date.now()}`;
  const adminUrl = new URL(sourceUrl);
  adminUrl.pathname = '/postgres';
  const targetUrl = new URL(sourceUrl);
  targetUrl.pathname = `/${targetName}`;
  const staging = path.resolve('e2e/.runtime', `old-main-staging-${Date.now()}`);
  const stagedMigrations = path.join(staging, 'migrations');
  fs.mkdirSync(stagedMigrations, { recursive: true });
  fs.copyFileSync('backend/prisma/schema.prisma', path.join(staging, 'schema.prisma'));
  fs.copyFileSync('backend/prisma/migrations/migration_lock.toml', path.join(stagedMigrations, 'migration_lock.toml'));
  const cutoff = '20260924100000_add_appliance_shelf_thermal_template';
  const names = fs.readdirSync('backend/prisma/migrations').filter((name) => /^\d{14}_/.test(name) && name <= cutoff).sort();
  for (const name of names) {
    const folder = path.join(stagedMigrations, name);
    fs.mkdirSync(folder);
    fs.copyFileSync(path.join('backend/prisma/migrations', name, 'migration.sql'), path.join(folder, 'migration.sql'));
  }
  const original = spawnSync('git', ['show', `4aa36bc:backend/prisma/migrations/${cutoff}/migration.sql`], { encoding: 'utf8' });
  if (original.status !== 0 || !original.stdout) throw new Error('Could not read the original variant A migration from git');
  fs.writeFileSync(path.join(stagedMigrations, cutoff, 'migration.sql'), original.stdout, 'utf8');

  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
  let target: PrismaClient | undefined;
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${targetName}"`);
    const deploy = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', path.join(staging, 'schema.prisma')], {
      env: { ...process.env, DATABASE_URL: targetUrl.toString() }, encoding: 'utf8', windowsHide: true,
    });
    if (deploy.status !== 0) throw new Error(`Old-main staged migration deployment failed (${deploy.status}): ${(deploy.stderr || deploy.stdout).slice(-1500)}`);
    target = new PrismaClient({ datasources: { db: { url: targetUrl.toString() } } });
    const [before] = await target.$queryRawUnsafe<{ w: string; h: string }[]>(
      `SELECT "cardWidthMm"::text AS w, "cardHeightMm"::text AS h FROM pricing_card_templates WHERE id='20000000-0000-4000-8000-000000000005'::uuid`
    );
    const history = await target.$queryRawUnsafe<{ migration_name: string }[]>(
      `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name IN ('20260924100000_add_appliance_shelf_thermal_template','20260924110000_refine_appliance_shelf_thermal_template') AND finished_at IS NOT NULL`
    );
    if (before?.w !== '120.00' || before.h !== '80.00' || history.length !== 1 || history[0].migration_name !== cutoff) {
      throw new Error('Synthetic old-main fixture has incorrect seed dimensions or migration history');
    }
    const candidate = path.resolve('backend/prisma/migrations/20260928010000_reconcile_thermal_template_variants/migration.sql');
    const psql = 'D:/Program Files/PostgreSQL/18/bin/psql.exe';
    const apply = spawnSync(psql, ['--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--single-transaction', '--dbname', targetUrl.toString(), '--file', candidate], { encoding: 'utf8', windowsHide: true });
    if (apply.status !== 0) throw new Error(`Candidate SQL failed (${apply.status}): ${(apply.stderr || apply.stdout).slice(-1500)}`);
    const [after] = await target.$queryRawUnsafe<{ w: string; h: string; featureMax: number }[]>(
      `SELECT "cardWidthMm"::text AS w, "cardHeightMm"::text AS h, "featureMax" FROM pricing_card_templates WHERE id='20000000-0000-4000-8000-000000000005'::uuid`
    );
    const [note] = await target.$queryRawUnsafe<{ outcome: string }[]>(
      `SELECT outcome FROM "_thermal_template_reconcile_notes" ORDER BY id DESC LIMIT 1`
    );
    if (after?.w !== '76.00' || after.h !== '80.00' || after.featureMax !== 2 || note?.outcome !== 'CONVERGED_FROM_VARIANT_A') {
      throw new Error('Candidate did not converge original variant A in the synthetic old-main database');
    }
    const outcomes = await MigrationExecutor.applyPending(target, MigrationRunner.readBundled());
    if (outcomes.some((outcome) => !outcome.applied)) {
      throw new Error(`Runtime migration chain failed: ${outcomes.find((outcome) => !outcome.applied)?.error}`);
    }
    const status = await MigrationExecutor.status(target, MigrationRunner.readBundled());
    if (status.pending.length || status.failed.length || status.mismatched.length ||
        !status.historicalChecksumDrift.includes(cutoff) ||
        !outcomes.some((outcome) => outcome.name === '20260928010000_reconcile_thermal_template_variants')) {
      throw new Error('Runtime migration chain did not reconcile old-main history cleanly');
    }
    console.log(`PASS: ${names.length} staged migrations through original variant A; refinement row absent; candidate alone converged 120x80 to 76x80.`);
    console.log(`PASS: runtime applied ${outcomes.length} later migration(s), recorded the forward migration, and kept only the allowlisted historical checksum drift.`);
    console.log(`Disposable database retained: ${targetName}`);
  } finally {
    await target?.$disconnect();
    await admin.$disconnect();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
