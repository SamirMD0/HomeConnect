import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../../../lib/prisma';

/**
 * Receipt-photo storage service. Image bytes are written to the shop PC's
 * filesystem under `receiptsDir()`; the database row holds only the filename
 * reference plus metadata (mime, bytes, who captured it, when).
 *
 * This keeps the Postgres volume small and lets backups treat the receipts
 * folder as a separate, deduplicatable artefact. Deleting a receipt row does
 * NOT delete the file on disk — a separate periodic cleanup job can prune
 * orphans. Deleting the parent supplier receiving cascades the row via the
 * Prisma schema; the file is likewise left to the cleanup job.
 */

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']);

export class ReceiptError extends Error {
  constructor(public code: 'INVALID_MIME' | 'EMPTY_BODY' | 'TOO_LARGE' | 'NOT_FOUND', message: string) {
    super(message);
    this.name = 'ReceiptError';
  }
}

export function receiptsDir(): string {
  const configured = process.env.RECEIPTS_DIR?.trim();
  if (configured) return configured;
  const userData = process.env.HOME_CONNECT_USER_DATA?.trim();
  if (userData) return path.join(userData, 'receipts');
  // Dev-mode fallback — repository-local folder (gitignored).
  return path.join(process.cwd(), 'receipts-dev');
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
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

export interface StoreReceiptInput {
  supplierReceivingId: string;
  capturedById: string;
  mime: string;
  bytes: Buffer;
}

export async function storeReceipt(input: StoreReceiptInput) {
  if (!ALLOWED_MIMES.has(input.mime)) {
    throw new ReceiptError(
      'INVALID_MIME',
      `Receipt image type ${input.mime} is not supported. Use JPEG, PNG, HEIC, HEIF, or WebP.`,
    );
  }
  if (input.bytes.length === 0) {
    throw new ReceiptError('EMPTY_BODY', 'Receipt image was empty.');
  }
  if (input.bytes.length > MAX_RECEIPT_BYTES) {
    throw new ReceiptError('TOO_LARGE', `Receipt image is too large (max ${MAX_RECEIPT_BYTES} bytes).`);
  }

  const existing = await prisma.supplierReceiving.findUnique({ where: { id: input.supplierReceivingId }, select: { id: true } });
  if (!existing) {
    throw new ReceiptError('NOT_FOUND', 'The supplier purchase for this receipt was not found.');
  }

  const dir = receiptsDir();
  await ensureDir(dir);

  const id = crypto.randomUUID();
  const filename = `${id}${extensionFor(input.mime)}`;
  const absolutePath = path.join(dir, filename);
  await fs.writeFile(absolutePath, input.bytes, { flag: 'wx' });

  try {
    return await prisma.supplierReceivingReceipt.create({
      data: {
        id,
        supplierReceivingId: input.supplierReceivingId,
        filename,
        mime: input.mime,
        bytes: input.bytes.length,
        capturedById: input.capturedById,
      },
    });
  } catch (error) {
    // Rollback the orphan file so the operator can retry with the same id namespace.
    await fs.unlink(absolutePath).catch(() => undefined);
    throw error;
  }
}

export async function listReceiptsForReceiving(supplierReceivingId: string) {
  return prisma.supplierReceivingReceipt.findMany({
    where: { supplierReceivingId },
    orderBy: { capturedAt: 'desc' },
    select: {
      id: true,
      filename: true,
      mime: true,
      bytes: true,
      capturedAt: true,
      capturedById: true,
      capturedBy: { select: { id: true, fullName: true } },
    },
  });
}

export const RECEIPT_LIMITS = {
  maxBytes: MAX_RECEIPT_BYTES,
  allowedMimes: Array.from(ALLOWED_MIMES),
};
