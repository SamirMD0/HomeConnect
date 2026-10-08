import { AuthedClient, HcApiError } from './hc-client';

/**
 * Upload a captured receipt photo. The backend accepts raw image bytes with
 * Content-Type: image/jpeg (or png / heic / heif / webp). No multipart; the
 * mobile sends the file URI's binary content directly.
 */

export interface UploadReceiptInput {
  supplierPurchaseId: string;
  localUri: string;
  mime: string;
}

export interface UploadedReceipt {
  id: string;
  supplierReceivingId: string;
  filename: string;
  mime: string;
  bytes: number;
  capturedAt: string;
  capturedById: string;
}

export async function uploadReceipt(client: AuthedClient, input: UploadReceiptInput): Promise<UploadedReceipt> {
  // Read the local file into a Blob the fetch body can carry. `expo-file-system`
  // writes bytes to a file URI; the simplest cross-platform path is to let
  // fetch handle the URI directly — React Native supports `uri` as a body on
  // modern versions, but Blob + FileSystem is also safe. Use a straight
  // fetch-into-Blob to keep behaviour deterministic.
  const fileResponse = await fetch(input.localUri);
  const blob = await fileResponse.blob();

  const envelope = await fetch(
    `${client.baseUrl}/api/v1/supplier-purchases/${encodeURIComponent(input.supplierPurchaseId)}/receipts`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${client.token}`,
        'Content-Type': input.mime,
      },
      body: blob,
    },
  );

  let parsed: unknown = null;
  try {
    parsed = await envelope.json();
  } catch {
    // Non-JSON — fall through.
  }

  if (envelope.ok && parsed && typeof parsed === 'object' && (parsed as { success?: boolean }).success === true) {
    return (parsed as { data: UploadedReceipt }).data;
  }

  const errorEnvelope = parsed as { error?: { code?: string; message?: string } } | null;
  const code = errorEnvelope?.error?.code ?? null;
  const message = errorEnvelope?.error?.message ?? 'Upload failed.';
  throw new HcApiError(
    message,
    envelope.status === 401 ? 'UNAUTHORIZED' : envelope.status === 413 ? 'VALIDATION' : envelope.status >= 500 ? 'SERVER' : 'VALIDATION',
    envelope.status,
    code,
  );
}
