import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { RepairManifestEntry, RepairRegistry } from './repair-registry';

const REAL_DIR = path.resolve(__dirname, '../../../prisma/repair');

const temporaryDirs: string[] = [];
afterEach(() => {
  // Only ever removes directories this test created under the OS temp dir.
  while (temporaryDirs.length) {
    const dir = temporaryDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** Builds a throwaway registry directory so tampering can be simulated safely. */
function makeRegistry(files: Record<string, string>, entries: Array<Partial<RepairManifestEntry>>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-repair-'));
  temporaryDirs.push(dir);

  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);

  const repairs = entries.map((entry) => ({
    repairId: entry.repairId ?? 'test',
    title: 'Test repair',
    version: '1.0.0',
    description: 'Test',
    file: entry.file ?? 'test.sql',
    checksum: entry.checksum ?? `sha256:${crypto.createHash('sha256').update(files[entry.file ?? 'test.sql'] ?? '').digest('hex')}`,
    requiresBackup: true,
    idempotent: true,
    requiresSuperuser: false,
    affectedTables: [],
    detectionQuery: 'SELECT 1',
    detectionExpects: 'empty',
    verificationQuery: 'SELECT 1',
    verificationExpects: 1,
  }));

  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ schemaVersion: 1, repairs }));
  return dir;
}

describe('repair registry — the real bundled manifest', () => {
  it('loads all 21 repairs with no problems', () => {
    const snapshot = RepairRegistry.load(REAL_DIR);
    expect(snapshot.problems).toEqual([]);
    expect(snapshot.repairs).toHaveLength(21);
  });

  it('matches every checksum against the file on disk', () => {
    for (const repair of RepairRegistry.load(REAL_DIR).repairs) {
      const bytes = fs.readFileSync(path.join(REAL_DIR, repair.entry.file));
      expect(repair.entry.checksum).toBe(`sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`);
    }
  });

  it('gives every repair a detection and a verification query', () => {
    for (const { entry } of RepairRegistry.load(REAL_DIR).repairs) {
      expect(entry.detectionQuery.length).toBeGreaterThan(10);
      expect(entry.verificationQuery.length).toBeGreaterThan(10);
      expect(entry.verificationExpects).toBeGreaterThan(0);
      expect(entry.repairId).not.toBe('');
    }
  });

  it('keeps repair ids unique so history rows cannot collide', () => {
    const ids = RepairRegistry.load(REAL_DIR).repairs.map((repair) => repair.entry.repairId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('flags the two extension repairs as needing a superuser', () => {
    const superuser = RepairRegistry.load(REAL_DIR).repairs
      .filter((repair) => repair.entry.requiresSuperuser)
      .map((repair) => repair.entry.repairId);
    expect(superuser).toContain('search-pg-trgm');
    expect(superuser).toContain('sales-orders-and-search');
  });

  it('parses every file into at least one statement', () => {
    for (const repair of RepairRegistry.load(REAL_DIR).repairs) {
      expect(repair.statementCount).toBeGreaterThan(0);
    }
  });
});

describe('repair registry — validation gates', () => {
  it('rejects a file whose contents no longer match the manifest', () => {
    const dir = makeRegistry(
      { 'test.sql': 'SELECT 1;' },
      [{ file: 'test.sql', checksum: `sha256:${'0'.repeat(64)}` }]
    );
    const snapshot = RepairRegistry.load(dir);
    expect(snapshot.repairs).toEqual([]);
    expect(snapshot.problems[0].code).toBe('CHECKSUM_MISMATCH');
    expect(snapshot.problems[0].message).toContain('altered');
  });

  it('rejects a manifest entry whose file is missing', () => {
    const dir = makeRegistry({}, [{ file: 'gone.sql', checksum: `sha256:${'0'.repeat(64)}` }]);
    expect(RepairRegistry.load(dir).problems[0].code).toBe('FILE_MISSING');
  });

  it('rejects destructive SQL even when the checksum matches', () => {
    const dir = makeRegistry({ 'bad.sql': 'DROP TABLE "customers";' }, [{ file: 'bad.sql' }]);
    const snapshot = RepairRegistry.load(dir);
    expect(snapshot.repairs).toEqual([]);
    expect(snapshot.problems[0].code).toBe('UNSAFE_SQL');
  });

  it('reports a .sql file that is not listed in the manifest', () => {
    const dir = makeRegistry({ 'test.sql': 'SELECT 1;', 'stray.sql': 'SELECT 2;' }, [{ file: 'test.sql' }]);
    const snapshot = RepairRegistry.load(dir);
    expect(snapshot.repairs).toHaveLength(1);
    expect(snapshot.problems.map((problem) => problem.code)).toContain('ORPHAN_FILE');
  });

  it('keeps the good repairs when one is bad', () => {
    const dir = makeRegistry(
      { 'good.sql': 'SELECT 1;', 'bad.sql': 'DROP TABLE "x";' },
      [{ repairId: 'good', file: 'good.sql' }, { repairId: 'bad', file: 'bad.sql' }]
    );
    const snapshot = RepairRegistry.load(dir);
    expect(snapshot.repairs.map((repair) => repair.entry.repairId)).toEqual(['good']);
    expect(snapshot.problems).toHaveLength(1);
  });

  it('reports a missing manifest rather than throwing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-empty-'));
    temporaryDirs.push(dir);
    const snapshot = RepairRegistry.load(dir);
    expect(snapshot.problems[0].code).toBe('MANIFEST_MISSING');
    expect(snapshot.repairs).toEqual([]);
  });

  it('reports an unreadable manifest rather than throwing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-broken-'));
    temporaryDirs.push(dir);
    fs.writeFileSync(path.join(dir, 'manifest.json'), '{ not json');
    expect(RepairRegistry.load(dir).problems[0].code).toBe('MANIFEST_UNREADABLE');
  });

  it('finds the bundled directory without configuration', () => {
    expect(fs.existsSync(path.join(RepairRegistry.resolveDirectory(), 'manifest.json'))).toBe(true);
  });
});
