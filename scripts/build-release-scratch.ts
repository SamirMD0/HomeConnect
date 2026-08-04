/**
 * Builds a scratch database at a chosen migration state, so a release repair
 * script can be generated with `prisma migrate diff --from-url` against the
 * schema the shop PC actually has.
 *
 *   npm run scratch:release -- --upto 20260804120000_add_sales_orders
 *
 * Preferable to concatenating migration files by hand: the result is a real
 * database, so the diff is verified rather than assumed. Never points at the
 * business database — it creates and uses its own.
 */
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { MigrationExecutor, MigrationClient } from '../backend/src/features/maintenance/migration-executor';
import { MigrationRunner } from '../backend/src/features/maintenance/migration-runner';

const REPO_ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(REPO_ROOT, 'backend/.env') });

const DB = process.env.SCRATCH_DB ?? 'homeconnect_release_scratch';

async function main() {
  const uptoIndex = process.argv.indexOf('--upto');
  const upto = uptoIndex === -1 ? null : process.argv[uptoIndex + 1];
  const recreate = process.argv.includes('--recreate');

  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is not set');
  const business = new URL(base).pathname.replace(/^\//, '');
  if (business === DB) throw new Error('refusing: DATABASE_URL points at the scratch database');
  console.log(`business database "${business}" will NOT be touched`);

  const adminUrl = withDatabase(base, 'postgres');
  const scratchUrl = withDatabase(base, DB);

  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  if (recreate) {
    // Only ever the scratch database, never anything else.
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB}"`);
    console.log(`dropped scratch database "${DB}"`);
  }
  const rows = await admin.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM pg_database WHERE datname = '${DB}'`
  );
  if (Number(rows[0]?.n ?? 0) === 0) {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${DB}"`);
    console.log(`created scratch database "${DB}"`);
  }
  await admin.$disconnect();

  const prisma = new PrismaClient({ datasources: { db: { url: scratchUrl } } });
  const all = MigrationRunner.readBundled(path.join(REPO_ROOT, 'backend/prisma/migrations'));
  const cutoff = upto ? all.findIndex((entry) => entry.name === upto) : all.length - 1;
  if (upto && cutoff === -1) throw new Error(`no migration named ${upto}`);
  const selected = all.slice(0, cutoff + 1);

  console.log(`applying ${selected.length} of ${all.length} migrations (up to ${selected.at(-1)?.name})`);
  const outcomes = await MigrationExecutor.applyPending(prisma as unknown as MigrationClient, selected);
  const failed = outcomes.filter((outcome) => !outcome.applied);
  for (const outcome of failed) console.log(`  FAILED ${outcome.name}: ${outcome.error}`);
  await prisma.$disconnect();

  if (failed.length) process.exit(1);
  console.log(`\nscratch database ready: ${DB}`);
}

function withDatabase(connectionString: string, database: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}

main().catch((error) => {
  console.error('FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
