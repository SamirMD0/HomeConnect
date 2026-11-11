import crypto from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { AppError, NotFoundError, ValidationError } from '../../../lib/errors';
import { assertInScope, writeBranch, type BranchScope } from '../../branches/branch-scope';
import { assertRecordInScope } from '../../branches/parent-branch';
import { DbReceiptStorage, DiskReceiptStorage, receiptStorage } from './receipt-storage';
export { receiptsDir } from './receipt-storage';

export const RECEIPT_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  allowedMimes: ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'],
};
export class ReceiptError extends AppError {
  constructor(code: 'INVALID_MIME' | 'EMPTY_BODY' | 'TOO_LARGE' | 'NOT_FOUND', message: string) {
    super(message, code === 'NOT_FOUND' ? 404 : code === 'TOO_LARGE' ? 413 : 400, code);
  }
}
const extensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/webp': '.webp',
};

// Older clients pass a receiving id; the purchases API returns ledger ids.
// Resolve both without allowing the global purchase guard to reject receivings.
export async function receiptReceiving(id: string, scope: BranchScope) {
  let receiving = await prisma.supplierReceiving.findUnique({ where: { id } });
  if (!receiving) {
    const purchase = await prisma.supplierTransaction.findUnique({ where: { id } });
    if (purchase) {
      assertInScope(purchase.branchId, scope);
      if (purchase.supplierReceivingId)
        receiving = await prisma.supplierReceiving.findUnique({
          where: { id: purchase.supplierReceivingId },
        });
    }
  }
  if (!receiving)
    throw new ReceiptError(
      'NOT_FOUND',
      'The supplier purchase for this receipt was not found.'
    );
  assertInScope(receiving.branchId, scope, 'The supplier purchase for this receipt was not found.');
  return receiving;
}

export interface StoreReceiptInput {
  supplierReceivingId?: string;
  supplierId?: string;
  note?: string;
  capturedById: string;
  mime: string;
  bytes: Buffer;
  receiptId?: string;
}
export async function storeReceipt(input: StoreReceiptInput, scope: BranchScope) {
  const branchId = writeBranch(scope);
  if (!RECEIPT_LIMITS.allowedMimes.includes(input.mime))
    throw new ReceiptError('INVALID_MIME', 'Use a JPEG, PNG, HEIC, HEIF, or WebP image.');
  if (!input.bytes.length) throw new ReceiptError('EMPTY_BODY', 'Receipt image was empty.');
  if (input.bytes.length > RECEIPT_LIMITS.maxBytes)
    throw new ReceiptError('TOO_LARGE', 'Receipt image is too large (max 8 MB).');
  const receiving = input.supplierReceivingId
    ? await receiptReceiving(input.supplierReceivingId, scope)
    : null;
  const supplierId = receiving?.supplierId ?? input.supplierId;
  if (!supplierId) throw new ValidationError('Assign a supplier before attaching bill photos.');
  await assertRecordInScope('supplier', supplierId, scope);
  const id = input.receiptId ?? crypto.randomUUID();
  const existing = input.receiptId
    ? await prisma.supplierReceivingReceipt.findUnique({ where: { id } })
    : null;
  if (existing) {
    if (
      existing.supplierId !== supplierId ||
      existing.branchId !== branchId ||
      existing.capturedById !== input.capturedById
    ) {
      throw new ValidationError('This bill upload identifier is already in use.');
    }
    return existing;
  }
  const data = {
    id,
    supplierId,
    branchId,
    supplierReceivingId: receiving?.id ?? null,
    note: input.note ?? null,
    filename: `${id}${extensions[input.mime]}`,
    mime: input.mime,
    bytes: input.bytes.length,
    capturedById: input.capturedById,
  };
  const storage = receiptStorage();
  if (storage instanceof DbReceiptStorage) {
    return prisma.$transaction(async (tx) => {
      const row = await tx.supplierReceivingReceipt.create({ data });
      await new DbReceiptStorage(tx).put(row, input.bytes);
      return row;
    });
  }
  await storage.put(data, input.bytes);
  try {
    return await prisma.supplierReceivingReceipt.create({ data });
  } catch (error) {
    await storage.delete(data);
    throw error;
  }
}
export async function listReceiptsForReceiving(id: string, scope: BranchScope) {
  const receiving = await receiptReceiving(id, scope);
  return prisma.supplierReceivingReceipt.findMany({
    where: { supplierReceivingId: receiving.id, branchId: { in: scope.branchIds } },
    orderBy: { capturedAt: 'desc' },
  });
}
export async function listBills(
  supplierId: string,
  linked: 'false' | 'true' | 'all',
  scope: BranchScope
) {
  await assertRecordInScope('supplier', supplierId, scope);
  return prisma.supplierReceivingReceipt.findMany({
    where: {
      supplierId,
      branchId: { in: scope.branchIds },
      ...(linked === 'all'
        ? {}
        : { supplierReceivingId: linked === 'true' ? { not: null } : null }),
    },
    orderBy: { capturedAt: 'desc' },
  });
}
async function scopedBill(id: string, scope: BranchScope) {
  const row = await prisma.supplierReceivingReceipt.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('Bill not found');
  assertInScope(row.branchId, scope, 'Bill not found');
  return row;
}
export async function updateBill(
  id: string,
  input: { supplierReceivingId: string | null; note?: string },
  scope: BranchScope
) {
  writeBranch(scope);
  const row = await scopedBill(id, scope);
  if (input.supplierReceivingId) {
    const receiving = await prisma.supplierReceiving.findUnique({
      where: { id: input.supplierReceivingId },
    });
    if (
      !receiving ||
      receiving.supplierId !== row.supplierId ||
      receiving.branchId !== row.branchId
    ) {
      throw new ValidationError(
        'The purchase must belong to the same supplier and branch as this bill.'
      );
    }
  }
  return prisma.supplierReceivingReceipt.update({ where: { id }, data: input });
}
export async function billImage(id: string, scope: BranchScope) {
  const row = await scopedBill(id, scope);
  try {
    // Prefer a persisted blob when present; existing disk rows still resolve in
    // hosted mode during transition, without copying bytes into API metadata.
    const blob = await prisma.supplierReceiptBlob.findUnique({ where: { receiptId: id } });
    const bytes = blob ? Buffer.from(blob.data) : await new DiskReceiptStorage().get(row);
    return { row, bytes };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new NotFoundError('Bill image not found');
    throw error;
  }
}
export async function deleteBill(id: string, scope: BranchScope) {
  writeBranch(scope);
  const row = await scopedBill(id, scope);
  // Cascading FK removes the blob. Disk delete is idempotent and retryable.
  await new DiskReceiptStorage().delete(row);
  await prisma.supplierReceivingReceipt.delete({ where: { id } });
}
