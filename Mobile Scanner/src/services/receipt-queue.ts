import * as FileSystem from 'expo-file-system/legacy';
import { AuthedClient } from '../api/hc-client';
import { uploadReceipt as defaultUploadReceipt } from '../api/receipts-api';

/** Signature of the upload adapter the queue invokes per entry. Injectable for tests. */
export type QueueUploader = (client: AuthedClient, input: { supplierPurchaseId: string; localUri: string; mime: string }) => Promise<unknown>;

/**
 * Persistent offline queue for receipt-photo uploads.
 *
 * Design: when the operator captures a photo, we COPY the bytes to a stable
 * location under the app's document directory, then append an entry to a
 * JSON index file. A background sync (triggered manually or on app foreground)
 * iterates pending entries, uploads them, and on success removes both the
 * index entry and the local file.
 *
 * Rationale:
 *   - expo-camera returns a cache URI that may be evicted; we need our own copy.
 *   - A JSON index file is simpler than SQLite for a few dozen pending items,
 *     and survives app restarts.
 *   - All I/O is wrapped in try/catch so a corrupt index never crashes the
 *     capture flow; a bad entry is dropped on read.
 */

const QUEUE_DIR_NAME = 'receipts-pending';
const INDEX_FILE_NAME = 'receipt-queue.json';

export type QueueStatus = 'pending' | 'uploading' | 'failed';

export interface QueuedReceipt {
  id: string;
  supplierPurchaseId: string;
  supplierPurchaseLabel: string;
  localPath: string;
  mime: string;
  bytes: number;
  capturedAt: string;
  attempts: number;
  lastError: string | null;
  status: QueueStatus;
}

export interface EnqueueInput {
  supplierPurchaseId: string;
  supplierPurchaseLabel: string;
  sourceUri: string;
  mime: string;
}

interface QueueFsAdapter {
  documentDirectory: string | null;
  makeDirectoryAsync(uri: string, options?: { intermediates?: boolean }): Promise<void>;
  copyAsync(options: { from: string; to: string }): Promise<void>;
  deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
  getInfoAsync(uri: string): Promise<{ exists: boolean; size?: number }>;
  readAsStringAsync(uri: string): Promise<string>;
  writeAsStringAsync(uri: string, content: string): Promise<void>;
}

const defaultFs: QueueFsAdapter = {
  documentDirectory: FileSystem.documentDirectory,
  makeDirectoryAsync: FileSystem.makeDirectoryAsync as QueueFsAdapter['makeDirectoryAsync'],
  copyAsync: FileSystem.copyAsync as QueueFsAdapter['copyAsync'],
  deleteAsync: FileSystem.deleteAsync as QueueFsAdapter['deleteAsync'],
  getInfoAsync: FileSystem.getInfoAsync as QueueFsAdapter['getInfoAsync'],
  readAsStringAsync: FileSystem.readAsStringAsync as QueueFsAdapter['readAsStringAsync'],
  writeAsStringAsync: FileSystem.writeAsStringAsync as QueueFsAdapter['writeAsStringAsync'],
};

export interface ReceiptQueue {
  listPending(): Promise<QueuedReceipt[]>;
  enqueue(input: EnqueueInput): Promise<QueuedReceipt>;
  flush(client: AuthedClient, onProgress?: (entry: QueuedReceipt, result: 'synced' | 'failed') => void): Promise<FlushResult>;
}

export interface FlushResult {
  attempted: number;
  synced: number;
  failed: number;
}

export function createReceiptQueue(
  fs: QueueFsAdapter = defaultFs,
  uploader: QueueUploader = defaultUploadReceipt,
): ReceiptQueue {
  if (!fs.documentDirectory) {
    throw new Error('expo-file-system has no document directory available.');
  }
  const dir = `${fs.documentDirectory}${QUEUE_DIR_NAME}/`;
  const indexPath = `${dir}${INDEX_FILE_NAME}`;

  async function ensureDir(): Promise<void> {
    const info = await fs.getInfoAsync(dir);
    if (!info.exists) await fs.makeDirectoryAsync(dir, { intermediates: true });
  }

  async function readIndex(): Promise<QueuedReceipt[]> {
    try {
      const info = await fs.getInfoAsync(indexPath);
      if (!info.exists) return [];
      const raw = await fs.readAsStringAsync(indexPath);
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isQueuedReceipt);
    } catch {
      return [];
    }
  }

  async function writeIndex(entries: QueuedReceipt[]): Promise<void> {
    await fs.writeAsStringAsync(indexPath, JSON.stringify(entries));
  }

  async function listPending(): Promise<QueuedReceipt[]> {
    const all = await readIndex();
    return all.filter((entry) => entry.status !== 'uploading');
  }

  async function enqueue(input: EnqueueInput): Promise<QueuedReceipt> {
    await ensureDir();
    const id = cryptoRandomId();
    const extension = extensionFor(input.mime);
    const localPath = `${dir}${id}${extension}`;
    await fs.copyAsync({ from: input.sourceUri, to: localPath });
    const info = await fs.getInfoAsync(localPath);
    const entry: QueuedReceipt = {
      id,
      supplierPurchaseId: input.supplierPurchaseId,
      supplierPurchaseLabel: input.supplierPurchaseLabel,
      localPath,
      mime: input.mime,
      bytes: info.size ?? 0,
      capturedAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
      status: 'pending',
    };
    const current = await readIndex();
    await writeIndex([...current, entry]);
    return entry;
  }

  async function flush(
    client: AuthedClient,
    onProgress?: (entry: QueuedReceipt, result: 'synced' | 'failed') => void,
  ): Promise<FlushResult> {
    const index = await readIndex();
    const pending = index.filter((entry) => entry.status === 'pending' || entry.status === 'failed');
    let synced = 0;
    let failed = 0;
    for (const entry of pending) {
      // Mark uploading so a parallel flush skips it.
      await writeIndex(index.map((row) => (row.id === entry.id ? { ...row, status: 'uploading' } : row)));
      try {
        await uploader(client, {
          supplierPurchaseId: entry.supplierPurchaseId,
          localUri: entry.localPath,
          mime: entry.mime,
        });
        synced += 1;
        onProgress?.(entry, 'synced');
        await fs.deleteAsync(entry.localPath, { idempotent: true });
        const after = (await readIndex()).filter((row) => row.id !== entry.id);
        await writeIndex(after);
        index.splice(index.findIndex((row) => row.id === entry.id), 1);
      } catch (error) {
        failed += 1;
        onProgress?.(entry, 'failed');
        const message = error instanceof Error ? error.message : 'Upload failed.';
        const after = (await readIndex()).map((row) =>
          row.id === entry.id
            ? { ...row, status: 'failed' as QueueStatus, attempts: entry.attempts + 1, lastError: message }
            : row,
        );
        await writeIndex(after);
        const liveIndex = index.find((row) => row.id === entry.id);
        if (liveIndex) {
          liveIndex.status = 'failed';
          liveIndex.attempts = entry.attempts + 1;
          liveIndex.lastError = message;
        }
      }
    }
    return { attempted: pending.length, synced, failed };
  }

  return { listPending, enqueue, flush };
}

function isQueuedReceipt(value: unknown): value is QueuedReceipt {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<QueuedReceipt>;
  return (
    typeof row.id === 'string' &&
    typeof row.supplierPurchaseId === 'string' &&
    typeof row.supplierPurchaseLabel === 'string' &&
    typeof row.localPath === 'string' &&
    typeof row.mime === 'string' &&
    typeof row.bytes === 'number' &&
    typeof row.capturedAt === 'string' &&
    typeof row.attempts === 'number' &&
    (row.lastError === null || typeof row.lastError === 'string') &&
    (row.status === 'pending' || row.status === 'uploading' || row.status === 'failed')
  );
}

function cryptoRandomId(): string {
  // SDK 54 ships a Web Crypto polyfill but to stay dependency-light we
  // generate a 128-bit random identifier via Math.random() segments.
  // Collision risk is negligible for a per-device receipt queue.
  const chunk = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `${chunk()}-${chunk()}-${chunk()}-${chunk()}`;
}

function extensionFor(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/heic':
      return '.heic';
    case 'image/heif':
      return '.heif';
    case 'image/webp':
      return '.webp';
    default:
      return '.bin';
  }
}
