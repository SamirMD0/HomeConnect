import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

async function main() {
const manifest = JSON.parse(fs.readFileSync('e2e/.runtime/databases.json', 'utf8'));
const sourceUrl = new URL(manifest.urls.ci);
const sourceName = sourceUrl.pathname.slice(1);
if (!/^hc_audit_test_ci(?:_phase4_phase5_phase6)?_\d+$/.test(sourceName)) {
  throw new Error('Source is not the isolated audit CI database');
}
const targetName = `hc_audit_test_drift_negative_${Date.now()}`;
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = '/postgres';
const targetUrl = new URL(sourceUrl);
targetUrl.pathname = `/${targetName}`;
const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
let target: PrismaClient | undefined;
try {
  // This creates a new disposable clone; no existing migration row is edited.
  await admin.$executeRawUnsafe(`CREATE DATABASE "${targetName}" WITH TEMPLATE "${sourceName}"`);
  target = new PrismaClient({ datasources: { db: { url: targetUrl.toString() } } });
  const migrationName = '20260924100000_add_appliance_shelf_thermal_template';
  const changed = await target.$executeRawUnsafe(
    `UPDATE "_prisma_migrations" SET checksum = repeat('0', 64) WHERE migration_name = $1 AND finished_at IS NOT NULL`,
    migrationName
  );
  if (changed !== 1) throw new Error(`Expected one synthetic migration row; got ${changed}`);
  await target.$disconnect();
  target = undefined;
  const result = spawnSync(process.execPath, ['scripts/assert-migration-drift-allowlisted.mjs'], {
    env: { ...process.env, DATABASE_URL: targetUrl.toString() },
    encoding: 'utf8',
    windowsHide: true,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  console.log(`Command: node scripts/assert-migration-drift-allowlisted.mjs (DATABASE_URL target: ${targetName})`);
  console.log(`Exit code: ${result.status}`);
  console.log(output.trim());
  if (result.status !== 1 || !output.includes(migrationName)) {
    throw new Error('Unknown checksum drift was not rejected with the migration name');
  }
} finally {
  await target?.$disconnect();
  await admin.$disconnect();
}
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Negative drift test failed');
  process.exitCode = 1;
});
