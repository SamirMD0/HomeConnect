#!/usr/bin/env node
/**
 * CI-side companion to backend/src/features/maintenance/checksum-allowlist.json.
 *
 * Runs against a database and refuses (exit 1) unless every migration whose
 * on-disk checksum differs from the recorded `_prisma_migrations.checksum` is
 * present in the shared allowlist as an exact (migration_name, recorded,
 * on-disk) triple. Runtime enforcement lives in `applyPending`; this script
 * makes the same policy fail CI before a build reaches the runtime.
 *
 * Reads the same JSON the runtime consumes, so there is no duplicate list to
 * keep in sync.
 *
 * Prisma's own `prisma migrate status` / `migrate deploy` inspects the database
 * itself and knows nothing about this file; it will still print drift warnings
 * for the allowlisted rows. That is expected and not a policy failure — this
 * script's exit code is what CI must gate on.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const allowlistPath = path.resolve(projectRoot, 'backend/src/features/maintenance/checksum-allowlist.json');
const migrationsDir = path.resolve(projectRoot, 'backend/prisma/migrations');

function fail(lines) {
  console.error('');
  for (const line of lines) console.error('  ' + line);
  console.error('');
  process.exit(1);
}

const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8')).entries;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) fail(['DATABASE_URL is not set; refusing to run.']);

const dbName = new URL(databaseUrl.replace(/^postgresql:/, 'http:')).pathname.slice(1);
if (!/^(hc_audit|homeconnect_(?:test|ci|rehearsal|reconcile))/.test(dbName)) {
  fail([`DATABASE_URL points at "${dbName}" which is not a recognised throwaway database.`]);
}

const require = (await import('node:module')).createRequire(path.join(projectRoot, 'backend', 'package.json'));
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

function checksumOf(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readBundled() {
  if (!existsSync(migrationsDir)) return [];
  return readdirSync(migrationsDir)
    .filter((name) => /^\d{14}_/.test(name))
    .filter((name) => statSync(path.join(migrationsDir, name)).isDirectory())
    .sort()
    .flatMap((name) => {
      const file = path.join(migrationsDir, name, 'migration.sql');
      if (!existsSync(file)) return [];
      return [{ name, checksum: checksumOf(readFileSync(file)) }];
    });
}

function isAllowlisted({ name, recorded, onDisk }) {
  return allowlist.some((entry) =>
    entry.migrationName === name &&
    entry.recordedChecksum === recorded &&
    entry.onDiskChecksum === onDisk
  );
}

try {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT "migration_name" AS name, "checksum" AS recorded, "finished_at" AS finished, "rolled_back_at" AS rolled_back FROM "_prisma_migrations"'
  );
  const bundled = readBundled();
  const bundledByName = new Map(bundled.map((entry) => [entry.name, entry.checksum]));
  const unknownDrift = [];
  const allowlistedDrift = [];

  for (const row of rows) {
    if (row.rolled_back || !row.finished) continue;
    const onDisk = bundledByName.get(row.name);
    if (!onDisk) continue;
    if (onDisk === row.recorded) continue;
    if (isAllowlisted({ name: row.name, recorded: row.recorded, onDisk })) {
      allowlistedDrift.push(row.name);
    } else {
      unknownDrift.push({ name: row.name, recorded: row.recorded, onDisk });
    }
  }

  if (unknownDrift.length > 0) {
    fail([
      'Migration drift outside the allowlist:',
      ...unknownDrift.map((entry) => `  - ${entry.name}: recorded=${entry.recorded.slice(0, 10)}… onDisk=${entry.onDisk.slice(0, 10)}…`),
      '',
      'Add an entry to backend/src/features/maintenance/checksum-allowlist.json only after a review that explains WHY the on-disk file diverged from what was applied.',
    ]);
  }

  console.log(`Allowlisted historical drift: ${allowlistedDrift.length} row(s). No unknown drift.`);
  if (allowlistedDrift.length > 0) for (const name of allowlistedDrift) console.log('  - ' + name);
} finally {
  await prisma.$disconnect();
}
