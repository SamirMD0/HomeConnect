import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { receiptSnapshotPath, restoreReceiptSnapshot, snapshotReceipts, verifyReceiptSnapshot } from './receipt-snapshot';

const filename = '11111111-1111-4111-8111-111111111111.jpg';
let root: string;
let backupPath: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'homeconnect-snapshot-test-'));
  process.env.RECEIPTS_DIR = path.join(root, 'receipts');
  backupPath = path.join(root, 'test.backup');
  await fs.mkdir(process.env.RECEIPTS_DIR);
});

afterEach(async () => {
  delete process.env.RECEIPTS_DIR;
  await fs.rm(root, { recursive: true, force: true });
});

describe('receipt snapshots', () => {
  it('copies, verifies, and restores photos without deleting newer files', async () => {
    await fs.writeFile(path.join(process.env.RECEIPTS_DIR!, filename), 'photo');
    await snapshotReceipts(backupPath);
    expect((await verifyReceiptSnapshot(backupPath))?.files).toHaveLength(1);
    await fs.rm(process.env.RECEIPTS_DIR!, { recursive: true });
    await fs.mkdir(process.env.RECEIPTS_DIR!);
    await fs.writeFile(path.join(process.env.RECEIPTS_DIR!, 'newer.jpg'), 'keep');
    await restoreReceiptSnapshot(backupPath);
    expect(await fs.readFile(path.join(process.env.RECEIPTS_DIR!, filename), 'utf8')).toBe('photo');
    expect(await fs.readFile(path.join(process.env.RECEIPTS_DIR!, 'newer.jpg'), 'utf8')).toBe('keep');
  });

  it('creates a verifiable empty snapshot for installations without photos', async () => {
    await snapshotReceipts(backupPath);
    expect((await verifyReceiptSnapshot(backupPath))?.files).toEqual([]);
  });

  it('detects tampered photos and refuses to overwrite a different local photo', async () => {
    await fs.writeFile(path.join(process.env.RECEIPTS_DIR!, filename), 'photo');
    await snapshotReceipts(backupPath);
    await fs.writeFile(path.join(process.env.RECEIPTS_DIR!, filename), 'other');
    await expect(restoreReceiptSnapshot(backupPath)).rejects.toThrow();
    await fs.writeFile(path.join(receiptSnapshotPath(backupPath), filename), 'changed');
    await expect(verifyReceiptSnapshot(backupPath)).rejects.toThrow(/verification failed/);
  });

  it('rejects a non-file entry in the receipt source', async () => {
    await fs.mkdir(path.join(process.env.RECEIPTS_DIR!, 'nested'));
    await expect(snapshotReceipts(backupPath)).rejects.toThrow(/non-file/);
  });

  it('distinguishes a legacy backup from a damaged snapshot folder', async () => {
    expect(await verifyReceiptSnapshot(backupPath)).toBeNull();
    await fs.mkdir(receiptSnapshotPath(backupPath));
    await expect(verifyReceiptSnapshot(backupPath)).rejects.toThrow(/manifest/);
  });
});
