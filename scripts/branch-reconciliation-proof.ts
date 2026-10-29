/** Synthetic desktop-upgrade proof, including existing historical-checksum policy. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { assertScratchDatabase } from './branch-reconciliation';
import {
  MigrationExecutor,
  type MigrationClient,
} from '../backend/src/features/maintenance/migration-executor';
import { MigrationRunner } from '../backend/src/features/maintenance/migration-runner';
import { historicalChecksumDriftAllowlist } from '../backend/src/features/maintenance/checksum-allowlist';
import { seedOwnershipHistory } from '../backend/src/test/branch-migration-fixture';

async function main() {
  dotenv.config({ path: 'backend/.env', quiet: true });
  assertScratchDatabase(process.env.DATABASE_URL);
  const name = 'homeconnect_test_mb_proof_' + randomUUID().replaceAll('-', '').slice(0, 20);
  const target = new URL(process.env.DATABASE_URL!);
  target.pathname = '/' + name;
  assertScratchDatabase(target.toString());
  const control = new URL(target);
  control.pathname = '/postgres';
  console.log('Confirmed synthetic proof target ' + name + '; administrative connection postgres');
  const admin = new PrismaClient({ datasources: { db: { url: control.toString() } } });
  let db: PrismaClient | undefined;
  const output = path.resolve('node_modules/.cache/home-connect/branch-proof');
  fs.mkdirSync(output, { recursive: true });
  const run = (script: string, args: string[]) => {
    console.log('Confirmed proof command database ' + assertScratchDatabase(target.toString()));
    const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.cjs', script, ...args], {
      env: { ...process.env, DATABASE_URL: target.toString() },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 120000,
    });
    console.log(result.stdout);
    if (result.status !== 0) {
      console.error(result.stderr);
      throw new Error('Proof command failed: ' + script);
    }
    return result.stdout;
  };
  try {
    await admin.$executeRawUnsafe('CREATE DATABASE "' + name + '"');
    console.log('Confirmed proof database ' + assertScratchDatabase(target.toString()));
    db = new PrismaClient({
      datasources: { db: { url: target.toString() } },
      transactionOptions: { timeout: 120000 },
    });
    const bundled = MigrationRunner.readBundled('backend/prisma/migrations');
    const pre = await MigrationExecutor.applyPending(
      db as unknown as MigrationClient,
      bundled.filter((m) => !m.name.includes('add_branch_ownership'))
    );
    if (pre.some((m) => !m.applied)) throw new Error(JSON.stringify(pre.filter((m) => !m.applied)));
    await db.$transaction((tx) => seedOwnershipHistory(tx), { timeout: 120000 });
    const allowed = historicalChecksumDriftAllowlist().find(
      (entry) =>
        entry.migrationName === '20260914180000_add_product_categories' &&
        bundled.some((m) => m.name === entry.migrationName && m.checksum === entry.onDiskChecksum)
    );
    if (!allowed) throw new Error('Expected historical-checksum fixture is unavailable');
    // Synthetic fixture only: reproduce the known historical row; the CLI must preserve it.
    console.log('Confirmed allowlist fixture database ' + assertScratchDatabase(target.toString()));
    await db.$executeRawUnsafe(
      'UPDATE "_prisma_migrations" SET checksum=$1 WHERE migration_name=$2',
      allowed.recordedChecksum,
      allowed.migrationName
    );
    console.log('Seeded known allowlisted checksum: ' + allowed.migrationName);
    const before = path.join(output, 'before.json'),
      after = path.join(output, 'after.json');
    const period = ['--period', '2026-08', '--as-of', '2026-10-27'];
    run('scripts/branch-reconciliation.ts', ['snapshot', '--out', before, ...period]);
    run('scripts/branch-reconciliation.ts', ['compare', '--before', before, '--after', before]);
    const applied = run('scripts/apply-bundled-migrations.ts', []);
    fs.writeFileSync(path.join(output, 'bundled-migrations.txt'), applied);
    const [recorded] = await db.$queryRawUnsafe<Array<{ checksum: string }>>(
      'SELECT checksum FROM "_prisma_migrations" WHERE migration_name=$1',
      allowed.migrationName
    );
    if (recorded.checksum !== allowed.recordedChecksum)
      throw new Error('Allowlisted checksum was rewritten');
    const [grants] = await db.$queryRawUnsafe<
      Array<{
        employeesGranted: number;
        employeeGrantRows: number;
        adminsGranted: number;
        deletedUsersGranted: number;
        employeesWithoutGrant: number;
      }>
    >(
      `SELECT count(DISTINCT a."userId") FILTER (WHERE u.role='EMPLOYEE' AND u."deletedAt" IS NULL)::int AS "employeesGranted",
        count(*) FILTER (WHERE u.role='EMPLOYEE' AND u."deletedAt" IS NULL)::int AS "employeeGrantRows",
        count(*) FILTER (WHERE u.role='ADMIN')::int AS "adminsGranted",
        count(*) FILTER (WHERE u."deletedAt" IS NOT NULL)::int AS "deletedUsersGranted",
        (SELECT count(*)::int FROM users employee WHERE employee.role='EMPLOYEE' AND employee."deletedAt" IS NULL
          AND NOT EXISTS (SELECT 1 FROM user_branch_access grant_row WHERE grant_row."userId"=employee.id)) AS "employeesWithoutGrant"
        FROM user_branch_access a JOIN users u ON u.id=a."userId"`
    );
    console.log('Grant counts: ' + JSON.stringify(grants));
    if (
      grants.employeesGranted !== 2 ||
      grants.employeeGrantRows !== 2 ||
      grants.adminsGranted ||
      grants.deletedUsersGranted ||
      grants.employeesWithoutGrant
    )
      throw new Error('Historical employee grants are incorrect');
    fs.writeFileSync(path.join(output, 'grants.json'), JSON.stringify(grants, null, 2) + '\n');
    run('scripts/branch-reconciliation.ts', ['snapshot', '--out', after, ...period]);
    const comparison = run('scripts/branch-reconciliation.ts', [
      'compare',
      '--before',
      before,
      '--after',
      after,
    ]);
    fs.writeFileSync(path.join(output, 'compare.txt'), comparison);
    console.log('Synthetic USD/LBP desktop proof saved in ' + output);
  } finally {
    await db?.$disconnect();
    console.log('Confirmed cleanup target ' + assertScratchDatabase(target.toString()));
    await admin.$executeRawUnsafe('DROP DATABASE IF EXISTS "' + name + '" WITH (FORCE)');
    await admin.$disconnect();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Proof failed');
  process.exitCode = 1;
});
