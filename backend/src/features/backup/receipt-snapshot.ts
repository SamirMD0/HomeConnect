import crypto from 'node:crypto';
import { constants } from 'node:fs';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { receiptsDir } from '../suppliers/receipts/receipts.service';

type ReceiptFile = { filename: string; bytes: number; sha256: string };
type ReceiptManifest = { version: 1; files: ReceiptFile[] };

export function receiptSnapshotPath(backupPath: string): string {
  return backupPath.replace(/\.backup$/i, '.receipts');
}

async function checksum(filePath: string): Promise<string> {
  return crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
}

export async function snapshotReceipts(backupPath: string): Promise<void> {
  const sourceDir = receiptsDir();
  const snapshotDir = receiptSnapshotPath(backupPath);
  let entries: Dirent[];
  try {
    entries = await fs.readdir(sourceDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    entries = [];
  }
  await fs.mkdir(snapshotDir);
  const files: ReceiptFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) throw new Error('Receipt directory contains a non-file entry');
    if (!/^[0-9a-f-]{36}\.(jpg|png|heic|heif|webp)$/.test(entry.name)) {
      throw new Error('Receipt directory contains an unexpected filename');
    }
    const source = path.join(sourceDir, entry.name);
    const destination = path.join(snapshotDir, entry.name);
    await fs.copyFile(source, destination);
    const [original, copied] = await Promise.all([fs.stat(source), fs.stat(destination)]);
    if (!original.isFile() || !copied.isFile() || original.size !== copied.size) {
      throw new Error('Receipt copy could not be verified');
    }
    const sourceChecksum = await checksum(source);
    if (sourceChecksum !== await checksum(destination)) throw new Error('Receipt copy checksum did not match');
    files.push({ filename: entry.name, bytes: original.size, sha256: sourceChecksum });
  }
  await fs.writeFile(path.join(snapshotDir, 'manifest.json'), JSON.stringify({ version: 1, files } satisfies ReceiptManifest));
}

export async function verifyReceiptSnapshot(backupPath: string): Promise<ReceiptManifest | null> {
  const snapshotDir = receiptSnapshotPath(backupPath);
  let raw: string;
  try {
    raw = await fs.readFile(path.join(snapshotDir, 'manifest.json'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      try { await fs.stat(snapshotDir); } catch (directoryError) {
        if ((directoryError as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw directoryError;
      }
    }
    throw new Error('Receipt snapshot manifest is missing or unreadable');
  }
  const manifest = JSON.parse(raw) as ReceiptManifest;
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) throw new Error('Invalid receipt snapshot manifest');
  const seen = new Set<string>();
  for (const file of manifest.files) {
    if (!/^[0-9a-f-]{36}\.(jpg|png|heic|heif|webp)$/.test(file.filename) || seen.has(file.filename)) {
      throw new Error('Invalid receipt snapshot filename');
    }
    seen.add(file.filename);
    const copied = path.join(snapshotDir, file.filename);
    const stats = await fs.lstat(copied);
    if (!stats.isFile() || stats.size !== file.bytes || await checksum(copied) !== file.sha256) {
      throw new Error('Receipt snapshot verification failed');
    }
  }
  return manifest;
}

export async function restoreReceiptSnapshot(backupPath: string): Promise<void> {
  const manifest = await verifyReceiptSnapshot(backupPath);
  if (!manifest) return; // Backups made before receipt snapshots remain usable.
  const destinationDir = receiptsDir();
  await fs.mkdir(destinationDir, { recursive: true });
  for (const file of manifest.files) {
    const destination = path.join(destinationDir, file.filename);
    try {
      await fs.copyFile(path.join(receiptSnapshotPath(backupPath), file.filename), destination, constants.COPYFILE_EXCL);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || await checksum(destination) !== file.sha256) throw error;
    }
  }
}
