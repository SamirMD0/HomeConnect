import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { scanSqlForUnsafeStatements } from './sql-safety-scanner';

/**
 * Loads and validates the bundled repair files. **It does not execute anything.**
 *
 * Every repair must clear three gates before it is even offered to an admin:
 *   1. the file named by the manifest exists;
 *   2. its SHA-256 matches the manifest exactly — a mismatch means the file was
 *      altered after review, which is a hard failure, not a warning;
 *   3. the safety scanner accepts it.
 *
 * Anything that fails a gate is reported as a problem and excluded from the
 * usable set, so a single tampered file cannot be applied but also cannot stop
 * the other sixteen from being listed.
 */

export interface RepairManifestEntry {
  repairId: string;
  title: string;
  version: string;
  description: string;
  file: string;
  /** `sha256:<hex>` */
  checksum: string;
  requiresBackup: boolean;
  idempotent: boolean;
  /** True when the SQL installs an untrusted extension and needs a superuser. */
  requiresSuperuser: boolean;
  affectedTables: string[];
  /** Returns rows when the repair has already been applied. */
  detectionQuery: string;
  /** `empty` means: the repair is needed when the detection query returns nothing. */
  detectionExpects: 'empty';
  verificationQuery: string;
  verificationExpects: number;
}

export interface LoadedRepair {
  entry: RepairManifestEntry;
  sql: string;
  statementCount: number;
}

export type RepairProblemCode =
  | 'MANIFEST_MISSING'
  | 'MANIFEST_UNREADABLE'
  | 'FILE_MISSING'
  | 'CHECKSUM_MISMATCH'
  | 'UNSAFE_SQL'
  | 'ORPHAN_FILE';

export interface RepairProblem {
  code: RepairProblemCode;
  repairId: string | null;
  file: string | null;
  message: string;
}

export interface RepairRegistrySnapshot {
  directory: string;
  repairs: LoadedRepair[];
  problems: RepairProblem[];
}

const MANIFEST_FILE = 'manifest.json';

export class RepairRegistry {
  /**
   * Packaged builds get the folder from `extraResources`; in development it sits
   * in the repo. Resolution is by probing rather than by an env flag, so tests
   * and the dev server find it without extra configuration.
   */
  static resolveDirectory(): string {
    const candidates = [
      process.env.HOME_CONNECT_REPAIR_DIR,
      process.resourcesPath ? path.join(process.resourcesPath, 'repair') : undefined,
      path.resolve(__dirname, '../../../prisma/repair'),
      path.resolve(process.cwd(), 'backend/prisma/repair'),
    ].filter((candidate): candidate is string => Boolean(candidate));

    return candidates.find((candidate) => fs.existsSync(path.join(candidate, MANIFEST_FILE))) ?? candidates[candidates.length - 1];
  }

  static load(directory = RepairRegistry.resolveDirectory()): RepairRegistrySnapshot {
    const problems: RepairProblem[] = [];
    const manifestPath = path.join(directory, MANIFEST_FILE);

    if (!fs.existsSync(manifestPath)) {
      return {
        directory,
        repairs: [],
        problems: [{ code: 'MANIFEST_MISSING', repairId: null, file: MANIFEST_FILE, message: `No repair manifest at ${manifestPath}. Reinstall HomeConnect.` }],
      };
    }

    let entries: RepairManifestEntry[];
    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { repairs?: RepairManifestEntry[] };
      entries = parsed.repairs ?? [];
    } catch (error) {
      return {
        directory,
        repairs: [],
        problems: [{ code: 'MANIFEST_UNREADABLE', repairId: null, file: MANIFEST_FILE, message: error instanceof Error ? error.message : 'Manifest could not be read.' }],
      };
    }

    const repairs: LoadedRepair[] = [];

    for (const entry of entries) {
      const filePath = path.join(directory, entry.file);
      if (!fs.existsSync(filePath)) {
        problems.push({ code: 'FILE_MISSING', repairId: entry.repairId, file: entry.file, message: `${entry.file} is listed in the manifest but missing. Reinstall HomeConnect.` });
        continue;
      }

      const bytes = fs.readFileSync(filePath);
      const actual = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
      if (actual !== entry.checksum) {
        problems.push({ code: 'CHECKSUM_MISMATCH', repairId: entry.repairId, file: entry.file, message: `${entry.file} has been altered since it was reviewed. Reinstall HomeConnect.` });
        continue;
      }

      const sql = bytes.toString('utf8');
      const safety = scanSqlForUnsafeStatements(sql);
      if (!safety.safe) {
        const detail = safety.violations.map((violation) => violation.message).join(' ');
        problems.push({ code: 'UNSAFE_SQL', repairId: entry.repairId, file: entry.file, message: `${entry.file} contains SQL that is not allowed: ${detail}` });
        continue;
      }

      repairs.push({ entry, sql, statementCount: safety.statementCount });
    }

    problems.push(...orphanFiles(directory, entries));

    return { directory, repairs, problems };
  }
}

/**
 * A `.sql` file present but unlisted is reported rather than ignored: it is
 * either a repair someone forgot to register, or a file that should not be
 * there. Both are worth surfacing, and neither is executable.
 */
function orphanFiles(directory: string, entries: RepairManifestEntry[]): RepairProblem[] {
  let onDisk: string[];
  try {
    onDisk = fs.readdirSync(directory).filter((name) => name.endsWith('.sql'));
  } catch {
    return [];
  }

  const listed = new Set(entries.map((entry) => entry.file));
  return onDisk
    .filter((name) => !listed.has(name))
    .map((name) => ({ code: 'ORPHAN_FILE' as const, repairId: null, file: name, message: `${name} is not listed in the repair manifest and will not be applied.` }));
}
