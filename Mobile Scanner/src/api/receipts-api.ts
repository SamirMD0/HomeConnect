import * as FileSystem from 'expo-file-system/legacy';
import { AuthedClient, authedHeaders, HcApiError, parseJsonEnvelope } from './hc-client';

export interface UploadReceiptInput {
  supplierPurchaseId: string | null;
  supplierId?: string;
  note?: string;
  localUri: string;
  mime: string;
  receiptId?: string;
  /** Upload id of the bill's first page: this photo becomes its next page. */
  billGroupId?: string;
}
export interface UploadedReceipt {
  id: string;
  supplierId: string;
  branchId?: string;
  supplierReceivingId: string | null;
  filename: string;
  mime: string;
  bytes: number;
  capturedAt: string;
  capturedById: string;
}
// Retain a native transfer that outlives the UI timeout. A retry joins it (or
// consumes its successful result), so a slow native request cannot double-upload.
const transfers = new Map<string, Promise<UploadedReceipt>>();
export async function uploadReceipt(
  client: AuthedClient,
  input: UploadReceiptInput
): Promise<UploadedReceipt> {
  const headers = authedHeaders(client);
  const key = `${client.baseUrl}|${headers['X-Branch-Scope']}|${input.localUri}|${input.supplierPurchaseId}|${input.supplierId}`;
  let transfer = transfers.get(key);
  if (!transfer) {
    const route = input.supplierPurchaseId
      ? `/supplier-purchases/${encodeURIComponent(input.supplierPurchaseId)}/receipts`
      : `/suppliers/${encodeURIComponent(input.supplierId ?? '')}/bills`;
    transfer = (async () => {
      let result: FileSystem.FileSystemUploadResult;
      try {
        result = await FileSystem.uploadAsync(
          `${client.baseUrl}/api/v1${route}?note=${encodeURIComponent(input.note ?? '')}`,
          input.localUri,
          {
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            httpMethod: 'POST',
            sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
            headers: {
              ...headers,
              'Content-Type': 'image/jpeg',
              Accept: 'application/json',
              ...(input.receiptId ? { 'X-Receipt-Id': input.receiptId } : {}),
              ...(input.billGroupId ? { 'X-Bill-Group': input.billGroupId } : {}),
            },
          }
        );
      } catch {
        throw new HcApiError(
          'Cannot reach the Home Connect server. Check Wi-Fi and the backend URL.',
          'NETWORK'
        );
      }
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(result.body);
      } catch {
        /* Use shared HTTP fallback. */
      }
      return parseJsonEnvelope<UploadedReceipt>(
        result.status,
        parsed,
        headers['X-Branch-Scope'] ?? null
      );
    })();
    transfers.set(key, transfer);
    void transfer.catch(() => {
      transfers.delete(key);
    });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      transfer,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new HcApiError('Upload timed out after 60 seconds. Check Wi-Fi and retry.', 'NETWORK')
            ),
          60_000
        );
      }),
    ]);
    transfers.delete(key);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

/** Replace one bill page with a new photo; the PC keeps the old page as history. */
export async function replaceBillPage(
  client: AuthedClient,
  page: { id: string; branchId: string },
  localUri: string
): Promise<UploadedReceipt> {
  const headers = { ...authedHeaders(client), 'X-Branch-Scope': page.branchId };
  let result: FileSystem.FileSystemUploadResult;
  try {
    result = await FileSystem.uploadAsync(
      `${client.baseUrl}/api/v1/supplier-bills/${encodeURIComponent(page.id)}/replace`,
      localUri,
      {
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        httpMethod: 'POST',
        sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
        headers: { ...headers, 'Content-Type': 'image/jpeg', Accept: 'application/json' },
      }
    );
  } catch {
    throw new HcApiError('Cannot reach the Home Connect server. Check Wi-Fi and retry.', 'NETWORK');
  }
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(result.body);
  } catch {
    /* Use shared HTTP fallback. */
  }
  return parseJsonEnvelope<UploadedReceipt>(result.status, parsed, page.branchId);
}
