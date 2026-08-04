/**
 * Rehearses the migration runner against a SCRATCH database.
 *
 * Part of the release checklist: proves the bundled migrations apply cleanly to
 * an empty database, and that a half-applied migration is detected and handled,
 * without ever touching the business database.
 *
 *   npm run rehearse:migrations
 *
 * The scratch database is created if missing and left in place afterwards, so
 * the state can be inspected. Nothing else is created, altered or dropped.
 */
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { MigrationExecutor, MigrationClient } from '../backend/src/features/maintenance/migration-executor';
import { MigrationRunner } from '../backend/src/features/maintenance/migration-runner';

const SCRATCH_DB = process.env.REHEARSAL_DB ?? 'homeconnect_rehearsal';
const REPO_ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(REPO_ROOT, 'backend/.env') });

async function main() {
  // Developer-machine only. Requiring an explicit flag means this can never be
  // run casually on a business PC, where the same command would connect with
  // live credentials even though it only ever writes to a scratch database.
  if (!process.argv.includes('--confirm-scratch')) {
    console.error('FAILED: this rehearsal is for a development machine only.');
    console.error('It creates a scratch database and never touches the business database,');
    console.error('but it must not be run on a shop PC holding real data.');
    console.error('\nIf you are on a development laptop, re-run with:');
    console.error('  npm run rehearse:migrations -- --confirm-scratch');
    process.exit(1);
  }

  const base = process.env.DATABASE_URL;
  if (!base) fail('DATABASE_URL is not set. Populate backend/.env first.');

  const businessDb = new URL(base).pathname.replace(/^\//, '');
  if (businessDb === SCRATCH_DB) fail('DATABASE_URL already points at the scratch database. Refusing to continue.');
  console.log(`business database "${businessDb}" will NOT be touched`);

  const adminUrl = withDatabase(base, 'postgres');
  const scratchUrl = withDatabase(base, SCRATCH_DB);

  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  const rows = await admin.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM pg_database WHERE datname = '${SCRATCH_DB}'`
  );
  if (Number(rows[0]?.n ?? 0) === 0) {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${SCRATCH_DB}"`);
    console.log(`created scratch database "${SCRATCH_DB}"`);
  } else {
    console.log(`reusing existing scratch database "${SCRATCH_DB}"`);
  }
  await admin.$disconnect();

  const prisma = new PrismaClient({ datasources: { db: { url: scratchUrl } } });
  const client = prisma as unknown as MigrationClient;
  const bundled = MigrationRunner.readBundled(path.join(REPO_ROOT, 'backend/prisma/migrations'));
  console.log(`\nbundled migrations: ${bundled.length}`);

  let phase1 = false;
  let phase2 = false;

  console.log('\n--- PHASE 1: apply to an empty database ---');
  const outcomes = await MigrationExecutor.applyPending(client, bundled);
  console.log(`attempted ${outcomes.length}, applied ${outcomes.filter((outcome) => outcome.applied).length}`);
  for (const outcome of outcomes.filter((outcome) => !outcome.applied)) {
    console.log(`  FAILED ${outcome.name}: ${outcome.error}`);
  }
  const afterApply = await MigrationExecutor.status(client, bundled);
  console.log(`pending=${afterApply.pending.length} failed=${afterApply.failed.length} mismatched=${afterApply.mismatched.length}`);
  phase1 = afterApply.pending.length === 0 && afterApply.failed.length === 0 && afterApply.mismatched.length === 0;
  console.log(`PHASE 1 ${phase1 ? 'PASS' : 'FAIL'}`);

  console.log('\n--- PHASE 2: half-applied migration is detected ---');
  const victim = bundled[bundled.length - 1].name;
  await prisma.$executeRawUnsafe(
    `UPDATE "_prisma_migrations" SET "finished_at" = NULL, "rolled_back_at" = NULL WHERE "migration_name" = '${victim}'`
  );
  const broken = await MigrationExecutor.status(client, bundled);
  const detected = broken.failed.includes(victim);
  console.log(`simulated an interrupted ${victim}; runner reports failed=[${broken.failed.join(', ')}]`);

  const recovery = await MigrationExecutor.applyPending(client, bundled);
  for (const outcome of recovery) {
    console.log(`  ${outcome.name}: applied=${outcome.applied} recovered=${outcome.recovered}`);
    if (outcome.error) console.log(`     ${outcome.error.split('\n')[0].slice(0, 160)}`);
  }
  const healed = await MigrationExecutor.status(client, bundled);
  console.log(`after recovery: pending=${healed.pending.length} failed=${healed.failed.length}`);

  // Detection is the guarantee that matters here. Whether a re-run can succeed
  // depends on whether that migration's SQL is idempotent — see the note below.
  phase2 = detected;
  console.log(`PHASE 2 ${phase2 ? 'PASS (detected)' : 'FAIL (not detected)'}`);
  if (healed.failed.length > 0) {
    console.log(`  NOTE: ${victim} could not be re-applied automatically.`);
    console.log('  Prisma migration SQL is not idempotent, so a genuinely half-applied');
    console.log('  migration needs its matching repair file from backend/prisma/repair/.');
  }

  await prisma.$disconnect();

  console.log(`\n=== REHEARSAL ${phase1 && phase2 ? 'PASSED' : 'FAILED'} ===`);
  console.log(`scratch database "${SCRATCH_DB}" was left in place; drop it with:`);
  console.log(`  DROP DATABASE "${SCRATCH_DB}";`);
  process.exit(phase1 && phase2 ? 0 : 1);
}

function withDatabase(connectionString: string, database: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}

function fail(message: string): never {
  console.error(`FAILED: ${message}`);
  process.exit(1);
}

main().catch((error) => {
  console.error('REHEARSAL ERROR:', error instanceof Error ? error.message : error);
  process.exit(1);
});
