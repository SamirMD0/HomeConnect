/** Reproducible synthetic proof; creates and removes its own isolated database. */
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
    const run = (args: string[]) => {
      console.log(
        'Confirmed snapshot/compare database ' + assertScratchDatabase(target.toString())
      );
      const result = spawnSync(
        process.execPath,
        ['node_modules/tsx/dist/cli.cjs', 'scripts/branch-reconciliation.ts', ...args],
        {
          env: { ...process.env, DATABASE_URL: target.toString() },
          encoding: 'utf8',
          windowsHide: true,
          timeout: 120000,
        }
      );
      console.log(result.stdout);
      if (result.status !== 0) {
        console.error(result.stderr);
        throw new Error('Reconciliation command failed');
      }
      return result.stdout;
    };
    const before = path.join(output, 'before.json'),
      after = path.join(output, 'after.json');
    const period = ['--period', '2026-08', '--as-of', '2026-10-27'];
    run(['snapshot', '--out', before, ...period]);
    run(['compare', '--before', before, '--after', before]);
    const migrated = await MigrationExecutor.applyPending(
      db as unknown as MigrationClient,
      bundled
    );
    if (migrated.some((m) => !m.applied)) throw new Error(JSON.stringify(migrated));
    run(['snapshot', '--out', after, ...period]);
    const comparison = run(['compare', '--before', before, '--after', after]);
    fs.writeFileSync(path.join(output, 'compare.txt'), comparison);
    console.log('Synthetic USD/LBP proof saved in ' + output);
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
