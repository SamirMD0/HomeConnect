/** Desktop migration path, restricted to restored copies and throwaway databases. */
import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { assertScratchDatabase } from './branch-reconciliation';
import {
  MigrationExecutor,
  type MigrationClient,
} from '../backend/src/features/maintenance/migration-executor';
import {
  MigrationRunner,
  type BundledMigration,
} from '../backend/src/features/maintenance/migration-runner';
import { isAllowlistedDrift } from '../backend/src/features/maintenance/checksum-allowlist';

export async function applyBundledMigrations(
  databaseUrl: string,
  client: MigrationClient,
  bundled: BundledMigration[],
  log: (message: string) => void = console.log
) {
  log('Confirmed bundled migration database: ' + assertScratchDatabase(databaseUrl));
  const before = await MigrationExecutor.status(client, bundled);
  for (const entry of before.entries) {
    if (!entry.historicalChecksumDrift && entry.state !== 'CHECKSUM_MISMATCH') continue;
    const migration = bundled.find((m) => m.name === entry.name)!;
    const allowed = isAllowlistedDrift({
      name: entry.name,
      recorded: entry.recordedChecksum ?? '',
      onDisk: migration.checksum,
    });
    log(
      'ALLOWLIST ' +
        (allowed ? 'ACCEPT ' : 'REJECT ') +
        entry.name +
        ' recorded=' +
        entry.recordedChecksum +
        ' bundled=' +
        migration.checksum +
        (allowed ? ' reason=' + allowed.reason : ' (unrecognized checksum triple)')
    );
  }
  log(
    'Allowlist decisions: ' +
      before.historicalChecksumDrift.length +
      ' accepted, ' +
      before.mismatched.length +
      ' rejected'
  );
  if (before.databaseIsNewer)
    throw new Error('Database has migrations newer than this build; use the matching build.');
  // applyPending itself enforces the shared allowlist. Never resolve or rewrite checksums here.
  const outcomes = await MigrationExecutor.applyPending(client, bundled);
  for (const outcome of outcomes) {
    log(
      (outcome.applied ? 'APPLIED ' : 'FAILED ') + outcome.name + ' (' + outcome.durationMs + 'ms)'
    );
    if (outcome.error) log(outcome.error);
  }
  if (outcomes.some((outcome) => !outcome.applied))
    throw new Error(
      'Bundled migration failed; transaction rolled back. Preserve the error for review.'
    );
  const after = await MigrationExecutor.status(client, bundled);
  log(
    'Status: pending=' +
      after.pending.length +
      ' failed=' +
      after.failed.length +
      ' mismatched=' +
      after.mismatched.length
  );
  if (after.pending.length || after.failed.length || after.mismatched.length)
    throw new Error('Bundled migration verification failed.');
  log(
    'BUNDLED MIGRATIONS PASS: applied=' +
      outcomes.length +
      ' allowlisted=' +
      after.historicalChecksumDrift.length
  );
  return { outcomes, summary: after };
}

async function main() {
  dotenv.config({ path: path.resolve('backend/.env'), quiet: true });
  const databaseUrl = process.env.DATABASE_URL;
  assertScratchDatabase(databaseUrl);
  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    transactionOptions: { timeout: 120000 },
  });
  try {
    await applyBundledMigrations(
      databaseUrl!,
      client as unknown as MigrationClient,
      MigrationRunner.readBundled(path.resolve(__dirname, '../backend/prisma/migrations'))
    );
  } finally {
    await client.$disconnect();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Bundled migration failed');
    process.exitCode = 1;
  });
