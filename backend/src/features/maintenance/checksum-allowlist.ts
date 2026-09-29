import allowlistJson from './checksum-allowlist.json';

/**
 * One allowed drift between what `_prisma_migrations` recorded on a running
 * installation and what the bundled `migration.sql` file hashes to today. Both
 * sides of the pair must match exactly for the entry to apply.
 *
 * The runtime reads this file to reclassify these three-tuples from
 * CHECKSUM_MISMATCH back to APPLIED; the CI helper
 * (`scripts/assert-migration-drift-allowlisted.mjs`) reads the same file so the
 * policy is defined once. Anything not in this list stays CHECKSUM_MISMATCH and
 * continues to block migration execution.
 *
 * This changes only Home Connect's own classifier. Prisma's own tooling
 * (`prisma migrate status`, `prisma migrate deploy`) inspects the database
 * itself and knows nothing about this allowlist; it will still print drift
 * warnings for these two rows, which is expected.
 */
export interface HistoricalChecksumDrift {
  migrationName: string;
  recordedChecksum: string;
  onDiskChecksum: string;
  reason: string;
}

const entries: readonly HistoricalChecksumDrift[] = Object.freeze(
  (allowlistJson as { entries: HistoricalChecksumDrift[] }).entries.map((entry) => Object.freeze({ ...entry }))
);

export function historicalChecksumDriftAllowlist(): readonly HistoricalChecksumDrift[] {
  return entries;
}

export function isAllowlistedDrift(
  candidate: { name: string; recorded: string; onDisk: string },
  allowlist: readonly HistoricalChecksumDrift[] = entries
): HistoricalChecksumDrift | null {
  const match = allowlist.find((entry) =>
    entry.migrationName === candidate.name &&
    entry.recordedChecksum === candidate.recorded &&
    entry.onDiskChecksum === candidate.onDisk
  );
  return match ?? null;
}
