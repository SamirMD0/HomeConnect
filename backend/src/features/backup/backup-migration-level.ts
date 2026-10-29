/**
 * Compares the database updates recorded inside a backup with the updates
 * this build ships. Application version strings are not enough: two installs
 * can report the same version while their schemas differ (a development build
 * that already carries newer migrations, or a business PC that has not run
 * them yet). The migration history inside the archive is the real schema level.
 */

export interface BackupMigrationLevel {
  /** False when the backup holds updates this build does not know. */
  compatible: boolean;
  /** Updates this build ships that the backup lacks; applied after restoring. */
  pendingAfterRestore: string[];
  /** Updates recorded in the backup that this build does not ship. */
  newerThanApp: string[];
}

/**
 * Reads applied migration names from `pg_restore --data-only` output for the
 * `_prisma_migrations` table (COPY text format). Rolled-back and unfinished
 * rows are ignored: they did not change the schema.
 */
export function parseBackupMigrationHistory(copyOutput: string): string[] {
  const lines = copyOutput.split(/\r?\n/);
  const header = lines.findIndex((line) => /^COPY\s+(?:public\.)?"?_prisma_migrations"?\s*\(/.test(line));
  if (header < 0) return [];

  const columns = lines[header]
    .slice(lines[header].indexOf('(') + 1, lines[header].indexOf(')'))
    .split(',')
    .map((column) => column.trim().replace(/"/g, ''));
  const nameAt = columns.indexOf('migration_name');
  const finishedAt = columns.indexOf('finished_at');
  const rolledBackAt = columns.indexOf('rolled_back_at');
  if (nameAt < 0) return [];

  const applied = new Set<string>();
  for (const line of lines.slice(header + 1)) {
    if (line === '\\.') break;
    const cells = line.split('\t');
    const finished = finishedAt < 0 || cells[finishedAt] !== '\\N';
    const rolledBack = rolledBackAt >= 0 && cells[rolledBackAt] !== '\\N';
    if (finished && !rolledBack && cells[nameAt]) applied.add(cells[nameAt]);
  }
  return [...applied].sort();
}

export function compareMigrationLevel(backupApplied: string[], bundled: string[]): BackupMigrationLevel {
  const shipped = new Set(bundled);
  const recorded = new Set(backupApplied);
  const newerThanApp = backupApplied.filter((name) => !shipped.has(name)).sort();
  return {
    compatible: newerThanApp.length === 0,
    pendingAfterRestore: bundled.filter((name) => !recorded.has(name)).sort(),
    newerThanApp,
  };
}
