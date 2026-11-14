import * as FileSystem from 'expo-file-system/legacy';
import { AuthedClient, HcApiError } from '../api/hc-client';
import { uploadReceipt as defaultUploadReceipt, UploadReceiptInput } from '../api/receipts-api';
import { selectedBranchHeaders } from '../branches/branch-selection';
import { linkBillToEntry } from '../suppliers/bills-inbox';

export type QueueUploader = (client: AuthedClient, input: UploadReceiptInput) => Promise<unknown>;
/** Links an uploaded bill to a ledger entry (a payment). */
export type QueueLinker = (
  client: AuthedClient,
  bill: { id: string; branchId: string },
  transactionId: string
) => Promise<unknown>;
export type QueueStatus = 'pending' | 'uploading' | 'failed' | 'blocked';
export interface QueuedReceipt {
  id: string;
  supplierPurchaseId: string | null;
  supplierId?: string;
  supplierPurchaseLabel: string;
  branchId?: string;
  serverUrl?: string;
  note?: string;
  /** Queue id of this bill's first page; set on page 2 and later. */
  groupLeadId?: string;
  /** Link the uploaded bill to this ledger entry (a payment) after upload. */
  supplierTransactionId?: string;
  localPath: string;
  mime: string;
  bytes: number;
  capturedAt: string;
  updatedAt: string;
  attempts: number;
  lastError: string | null;
  status: QueueStatus;
}
export interface EnqueueInput {
  supplierPurchaseId: string | null;
  supplierId?: string;
  supplierPurchaseLabel: string;
  branchId?: string;
  serverUrl?: string;
  note?: string;
  groupLeadId?: string;
  supplierTransactionId?: string;
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
  moveAsync?(options: { from: string; to: string }): Promise<void>;
}

const defaultFs: QueueFsAdapter = {
  documentDirectory: FileSystem.documentDirectory,
  makeDirectoryAsync: FileSystem.makeDirectoryAsync as QueueFsAdapter['makeDirectoryAsync'],
  copyAsync: FileSystem.copyAsync as QueueFsAdapter['copyAsync'],
  deleteAsync: FileSystem.deleteAsync as QueueFsAdapter['deleteAsync'],
  getInfoAsync: FileSystem.getInfoAsync as QueueFsAdapter['getInfoAsync'],
  readAsStringAsync: FileSystem.readAsStringAsync as QueueFsAdapter['readAsStringAsync'],
  writeAsStringAsync: FileSystem.writeAsStringAsync as QueueFsAdapter['writeAsStringAsync'],
  moveAsync: FileSystem.moveAsync,
};

export interface ReceiptQueue {
  listPending(): Promise<QueuedReceipt[]>;
  enqueue(input: EnqueueInput): Promise<QueuedReceipt>;
  flush(
    client: AuthedClient,
    onProgress?: (entry: QueuedReceipt, result: 'synced' | 'failed') => void,
    onlyId?: string
  ): Promise<FlushResult>;
  retry(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  changePurchase(
    id: string,
    purchaseId: string | null,
    label: string,
    supplierId?: string
  ): Promise<void>;
}
export interface FlushResult {
  attempted: number;
  synced: number;
  failed: number;
}
interface Coordinator {
  writes: Promise<unknown>;
  flush: Promise<FlushResult> | null;
}
// Shared across queue instances (capture, Pending bills, foreground sync).
const coordinators = new WeakMap<QueueFsAdapter, Coordinator>();
/**
 * Stable upload UUID for a queue id (four groups of eight hex digits). The PC
 * deduplicates on it, and later pages name the first page's id as their bill.
 */
export function receiptIdFor(queueId: string): string | undefined {
  const hex = queueId.replace(/-/g, '');
  return /^[0-9a-f]{32}$/i.test(hex)
    ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`
    : undefined;
}
export function createReceiptQueue(
  fs: QueueFsAdapter = defaultFs,
  uploader: QueueUploader = defaultUploadReceipt,
  linker: QueueLinker = linkBillToEntry
): ReceiptQueue {
  if (!fs.documentDirectory) throw new Error('Photo storage is unavailable.');
  const dir = `${fs.documentDirectory}receipts-pending/`;
  const indexPath = `${dir}receipt-queue.json`;
  let coordinator = coordinators.get(fs);
  if (!coordinator) {
    coordinator = { writes: Promise.resolve(), flush: null };
    coordinators.set(fs, coordinator);
  }
  const lock = coordinator;
  function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = lock.writes.then(operation);
    lock.writes = next.catch(() => undefined);
    return next;
  }
  async function readIndex(): Promise<QueuedReceipt[]> {
    if (!(await fs.getInfoAsync(indexPath)).exists) return [];
    const raw = await fs.readAsStringAsync(indexPath);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Pending bills index is unreadable. Photos are still stored on this phone.');
    }
    if (!Array.isArray(parsed)) throw new Error('Pending bills index is invalid.');
    return parsed
      .filter((value): value is QueuedReceipt =>
        Boolean(
          value &&
          typeof value === 'object' &&
          typeof value.id === 'string' &&
          (typeof value.supplierPurchaseId === 'string' || value.supplierPurchaseId === null) &&
          typeof value.supplierPurchaseLabel === 'string' &&
          typeof value.localPath === 'string' &&
          typeof value.mime === 'string' &&
          typeof value.capturedAt === 'string' &&
          typeof value.attempts === 'number' &&
          ['pending', 'uploading', 'failed', 'blocked'].includes(value.status)
        )
      )
      .map((entry) => {
        const updatedAt = entry.updatedAt ?? entry.capturedAt;
        if (entry.status === 'uploading' && Date.now() - Date.parse(updatedAt) > 120_000) {
          return {
            ...entry,
            updatedAt: new Date().toISOString(),
            status: 'failed',
            lastError: 'Upload was interrupted. Please retry.',
          };
        }
        return { ...entry, updatedAt };
      });
  }
  async function writeIndex(entries: QueuedReceipt[]) {
    const destination = fs.moveAsync ? `${indexPath}.tmp` : indexPath;
    await fs.writeAsStringAsync(destination, JSON.stringify(entries));
    if (fs.moveAsync) await fs.moveAsync({ from: destination, to: indexPath });
  }
  function mutate(change: (rows: QueuedReceipt[]) => QueuedReceipt[]) {
    return exclusive(async () => {
      const rows = change(await readIndex());
      await writeIndex(rows);
    });
  }
  async function listPending() {
    return exclusive(async () => {
      const rows = await readIndex();
      if (rows.length) await writeIndex(rows);
      return rows;
    });
  }
  async function enqueue(input: EnqueueInput): Promise<QueuedReceipt> {
    return exclusive(async () => {
      if (!(await fs.getInfoAsync(dir)).exists)
        await fs.makeDirectoryAsync(dir, { intermediates: true });
      const id = Array.from({ length: 4 }, () =>
        Math.floor(Math.random() * 0xffffffff)
          .toString(16)
          .padStart(8, '0')
      ).join('-');
      const localPath = `${dir}${id}.jpg`;
      await fs.copyAsync({ from: input.sourceUri, to: localPath });
      const now = new Date().toISOString();
      const entry: QueuedReceipt = {
        ...input,
        id,
        localPath,
        bytes: (await fs.getInfoAsync(localPath)).size ?? 0,
        capturedAt: now,
        updatedAt: now,
        attempts: 0,
        lastError: null,
        status: 'pending',
      };
      await writeIndex([...(await readIndex()), entry]);
      return entry;
    });
  }
  function flush(
    client: AuthedClient,
    onProgress?: (entry: QueuedReceipt, result: 'synced' | 'failed') => void,
    onlyId?: string
  ): Promise<FlushResult> {
    if (lock.flush)
      return onlyId ? lock.flush.then(() => flush(client, onProgress, onlyId)) : lock.flush;
    lock.flush = (async () => {
      const branch = selectedBranchHeaders()['X-Branch-Scope'];
      const pending = (await listPending()).filter(
        (row) =>
          (row.status === 'pending' || row.status === 'failed') &&
          (!onlyId || row.id === onlyId) &&
          (!row.branchId || row.branchId === branch) &&
          (!row.serverUrl || row.serverUrl === client.baseUrl)
      );
      let synced = 0,
        failed = 0;
      for (const entry of pending) {
        // Stop if a revocation or branch switch happened during this flush.
        if (selectedBranchHeaders()['X-Branch-Scope'] !== branch) break;
        // A later page waits until its first page is on the PC (it then
        // leaves the queue); uploading it first would be refused.
        if (entry.groupLeadId && (await listPending()).some((row) => row.id === entry.groupLeadId))
          continue;
        let claimed = false;
        await mutate((rows) =>
          rows.map((row) => {
            if (row.id !== entry.id || (row.status !== 'pending' && row.status !== 'failed'))
              return row;
            claimed = true;
            return { ...row, status: 'uploading', updatedAt: new Date().toISOString() };
          })
        );
        if (!claimed) continue;
        try {
          // Server deduplication on this stable id closes the
          // crash-after-response gap, and makes a retried link step safe.
          const receiptId = receiptIdFor(entry.id);
          const uploaded = (await uploader(client, {
            supplierPurchaseId: entry.supplierPurchaseId,
            supplierId: entry.supplierId,
            note: entry.note,
            localUri: entry.localPath,
            mime: entry.mime,
            receiptId,
            billGroupId: entry.groupLeadId ? receiptIdFor(entry.groupLeadId) : undefined,
          })) as { id?: string; branchId?: string } | undefined;
          // Later pages inherit the first page's links on the PC.
          if (entry.supplierTransactionId && !entry.groupLeadId && uploaded?.id)
            await linker(
              client,
              { id: uploaded.id, branchId: uploaded.branchId ?? entry.branchId ?? branch ?? '' },
              entry.supplierTransactionId
            );
        } catch (error) {
          failed += 1;
          const retryable =
            !(error instanceof HcApiError) ||
            error.kind === 'NETWORK' ||
            (error.status !== null && error.status >= 500);
          const message = error instanceof Error ? error.message : 'Upload failed.';
          await mutate((rows) =>
            rows.map((row) =>
              row.id === entry.id
                ? {
                    ...row,
                    status: retryable ? 'failed' : 'blocked',
                    attempts: row.attempts + 1,
                    lastError: message,
                    updatedAt: new Date().toISOString(),
                  }
                : row
            )
          );
          onProgress?.(
            { ...entry, lastError: message, status: retryable ? 'failed' : 'blocked' },
            'failed'
          );
          if (error instanceof HcApiError && error.kind === 'UNAUTHORIZED') break;
          continue;
        }
        // An upload succeeded. Local cleanup failure must never turn it into a
        // retryable upload and create a second row on the server.
        await mutate((rows) => rows.filter((row) => row.id !== entry.id));
        await fs.deleteAsync(entry.localPath, { idempotent: true }).catch(() => undefined);
        synced += 1;
        onProgress?.(entry, 'synced');
      }
      return { attempted: synced + failed, synced, failed };
    })().finally(() => {
      lock.flush = null;
    });
    return lock.flush;
  }
  async function retry(id: string) {
    await mutate((rows) =>
      rows.map((row) =>
        row.id === id && row.status !== 'uploading'
          ? { ...row, status: 'pending', updatedAt: new Date().toISOString() }
          : row
      )
    );
  }
  async function remove(id: string) {
    await exclusive(async () => {
      const rows = await readIndex();
      const entry = rows.find((row) => row.id === id);
      if (!entry || entry.status === 'uploading') return;
      await writeIndex(rows.filter((row) => row.id !== id));
      await fs.deleteAsync(entry.localPath, { idempotent: true });
    });
  }
  async function changePurchase(
    id: string,
    purchaseId: string | null,
    label: string,
    supplierId?: string
  ) {
    await mutate((rows) =>
      rows.map((row) =>
        row.id === id && row.status !== 'uploading'
          ? {
              ...row,
              supplierPurchaseId: purchaseId,
              supplierPurchaseLabel: label,
              supplierId: supplierId ?? row.supplierId,
              status: 'pending',
              lastError: null,
              updatedAt: new Date().toISOString(),
            }
          : row
      )
    );
  }
  return { listPending, enqueue, flush, retry, remove, changePurchase };
}
let sharedQueue: ReceiptQueue | null = null;
export function receiptQueue(): ReceiptQueue {
  return (sharedQueue ??= createReceiptQueue());
}
export function uploadFailureMessage(entry: QueuedReceipt) {
  return entry.status === 'failed'
    ? `${entry.lastError} Saved locally, will retry.`
    : (entry.lastError ?? 'Upload needs attention.');
}
