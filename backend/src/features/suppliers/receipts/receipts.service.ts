import crypto from 'node:crypto';
import type { SupplierReceivingReceipt } from '@prisma/client';
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
  /** First page of an existing bill: this upload becomes its next page. */
  billGroupId?: string;
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
  const group = input.billGroupId
    ? await nextPage(input.billGroupId, supplierId, branchId)
    : null;
  const data = {
    id,
    supplierId,
    branchId,
    supplierReceivingId: receiving?.id ?? group?.supplierReceivingId ?? null,
    supplierTransactionId: group?.supplierTransactionId ?? null,
    billGroupId: group?.billGroupId ?? id,
    pageNumber: group?.pageNumber ?? 1,
    note: input.note ?? group?.note ?? null,
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
/** Pages that are neither replaced nor deleted. */
export const activePage = { deletedAt: null, replacedAt: null } as const;
const unlinked = { supplierReceivingId: null, supplierTransactionId: null } as const;

type PageRow = SupplierReceivingReceipt;
export type BillWithPages<T extends PageRow = PageRow> = T & { pages: T[]; pageCount: number };

/**
 * One entry per bill: the first page's fields (so older clients keep working)
 * plus every active page in order. Bills keep the order of their first row.
 */
export function groupPages<T extends PageRow>(rows: T[]): BillWithPages<T>[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.billGroupId ?? row.id;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((pages) => {
    const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
    return { ...sorted[0], pages: sorted, pageCount: sorted.length };
  });
}

async function nextPage(billGroupId: string, supplierId: string, branchId: string) {
  const pages = await prisma.supplierReceivingReceipt.findMany({
    where: { billGroupId, ...activePage },
    orderBy: { pageNumber: 'asc' },
  });
  const first = pages[0];
  if (!first || first.supplierId !== supplierId || first.branchId !== branchId)
    throw new ValidationError('Add pages only to a bill of the same supplier and branch.');
  return {
    billGroupId,
    pageNumber: Math.max(...pages.map((page) => page.pageNumber)) + 1,
    supplierReceivingId: first.supplierReceivingId,
    supplierTransactionId: first.supplierTransactionId,
    note: first.note,
  };
}

export async function listReceiptsForReceiving(id: string, scope: BranchScope) {
  const receiving = await receiptReceiving(id, scope);
  const rows = await prisma.supplierReceivingReceipt.findMany({
    where: { supplierReceivingId: receiving.id, branchId: { in: scope.branchIds }, ...activePage },
    orderBy: { capturedAt: 'desc' },
  });
  return groupPages(rows);
}

/** Bills attached to a ledger entry: directly, or through its receiving. */
export async function listBillsForTransaction(id: string, scope: BranchScope) {
  const transaction = await prisma.supplierTransaction.findUnique({ where: { id } });
  if (!transaction) throw new NotFoundError('Supplier entry not found');
  assertInScope(transaction.branchId, scope, 'Supplier entry not found');
  const rows = await prisma.supplierReceivingReceipt.findMany({
    where: {
      branchId: { in: scope.branchIds },
      ...activePage,
      OR: [
        { supplierTransactionId: id },
        ...(transaction.supplierReceivingId
          ? [{ supplierReceivingId: transaction.supplierReceivingId }]
          : []),
      ],
    },
    orderBy: { capturedAt: 'desc' },
  });
  return groupPages(rows);
}

export async function listBills(
  supplierId: string,
  linked: 'false' | 'true' | 'all',
  scope: BranchScope
) {
  await assertRecordInScope('supplier', supplierId, scope);
  const rows = await prisma.supplierReceivingReceipt.findMany({
    where: {
      supplierId,
      branchId: { in: scope.branchIds },
      ...activePage,
      ...(linked === 'all' ? {} : linked === 'true' ? { NOT: unlinked } : unlinked),
    },
    orderBy: { capturedAt: 'desc' },
  });
  return groupPages(rows);
}
/**
 * Bills inbox: unlinked bills across every supplier the caller can see, newest
 * first, with the supplier's name so a phone or the PC can triage them.
 */
export async function listUnlinkedBills(scope: BranchScope, limit = 100) {
  const take = Math.min(Math.max(limit, 1), 200);
  const rows = await prisma.supplierReceivingReceipt.findMany({
    where: { ...unlinked, ...activePage, branchId: { in: scope.branchIds } },
    orderBy: { capturedAt: 'desc' },
    // Several pages can share one bill; fetch extra rows so `take` bills fill.
    take: take * 4,
    include: { supplier: { select: { id: true, name: true } } },
  });
  return groupPages(
    rows.map(({ supplier, ...row }) => ({ ...row, supplierName: supplier.name }))
  ).slice(0, take);
}
export async function countUnlinkedBills(scope: BranchScope) {
  const groups = await prisma.supplierReceivingReceipt.groupBy({
    by: ['billGroupId'],
    where: { ...unlinked, ...activePage, branchId: { in: scope.branchIds } },
  });
  return groups.length;
}
async function scopedBill(id: string, scope: BranchScope) {
  const row = await prisma.supplierReceivingReceipt.findUnique({ where: { id } });
  if (!row || row.deletedAt) throw new NotFoundError('Bill not found');
  assertInScope(row.branchId, scope, 'Bill not found');
  return row;
}
const groupWhere = (row: PageRow) => ({ billGroupId: row.billGroupId ?? row.id, ...activePage });

/**
 * Resolve a ledger entry for a bill link. A purchase that received stock links
 * through its receiving (where the PC already shows bills); a payment, or a
 * purchase without stock, links to the ledger entry itself.
 */
async function resolveTransactionLink(transactionId: string, row: PageRow) {
  const transaction = await prisma.supplierTransaction.findUnique({ where: { id: transactionId } });
  if (
    !transaction ||
    transaction.supplierId !== row.supplierId ||
    transaction.branchId !== row.branchId
  )
    throw new ValidationError(
      'The entry must belong to the same supplier and branch as this bill.'
    );
  if (transaction.status !== 'ACTIVE')
    throw new ValidationError('This entry was removed. Choose an active purchase or payment.');
  if (transaction.type !== 'SUPPLIER_PAYMENT' && transaction.type !== 'SUPPLIER_DEBT')
    throw new ValidationError('Bills can link only to a purchase or a payment.');
  return transaction.type === 'SUPPLIER_DEBT' && transaction.supplierReceivingId
    ? { supplierReceivingId: transaction.supplierReceivingId }
    : { supplierTransactionId: transaction.id };
}

export interface UpdateBillInput {
  supplierReceivingId?: string | null;
  supplierTransactionId?: string | null;
  note?: string;
}
/** Link, unlink or annotate a whole bill (every active page). Omitted fields stay. */
export async function updateBill(id: string, input: UpdateBillInput, scope: BranchScope) {
  writeBranch(scope);
  const row = await scopedBill(id, scope);
  const data: UpdateBillInput = {};
  if (input.supplierReceivingId !== undefined) data.supplierReceivingId = input.supplierReceivingId;
  if (input.supplierTransactionId !== undefined)
    data.supplierTransactionId = input.supplierTransactionId;
  if (input.note !== undefined) data.note = input.note;
  if (data.supplierReceivingId) {
    const receiving = await prisma.supplierReceiving.findUnique({
      where: { id: data.supplierReceivingId },
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
  if (data.supplierTransactionId) {
    const link = await resolveTransactionLink(data.supplierTransactionId, row);
    delete data.supplierTransactionId;
    Object.assign(data, link);
  }
  await prisma.supplierReceivingReceipt.updateMany({ where: groupWhere(row), data });
  return prisma.supplierReceivingReceipt.findUniqueOrThrow({ where: { id } });
}

/**
 * Replace one page with a new photo. The new page takes the old one's place
 * (same bill, page number, links and note); the old page stays as history.
 */
export async function replaceBillPage(
  id: string,
  input: { capturedById: string; mime: string; bytes: Buffer },
  scope: BranchScope
) {
  const old = await scopedBill(id, scope);
  if (old.replacedAt) throw new ValidationError('This page was already replaced.');
  const created = await storeReceipt(
    {
      supplierId: old.supplierId,
      capturedById: input.capturedById,
      mime: input.mime,
      bytes: input.bytes,
      note: old.note ?? undefined,
    },
    scope
  );
  const [page] = await prisma.$transaction([
    prisma.supplierReceivingReceipt.update({
      where: { id: created.id },
      data: {
        billGroupId: old.billGroupId ?? old.id,
        pageNumber: old.pageNumber,
        supplierReceivingId: old.supplierReceivingId,
        supplierTransactionId: old.supplierTransactionId,
      },
    }),
    prisma.supplierReceivingReceipt.update({
      where: { id: old.id },
      data: { replacedById: created.id, replacedAt: new Date() },
    }),
  ]);
  return page;
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

export const EMPLOYEE_DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;
export interface BillActor {
  userId: string;
  role: string;
}
/**
 * Admins (and managers) delete any bill. Employees delete only a bill they
 * captured themselves, while it is still unlinked and under 24 hours old.
 */
export function canDeleteBill(row: PageRow, actor: BillActor, now = new Date()) {
  if (actor.role === 'ADMIN' || actor.role === 'MANAGER') return true;
  return (
    row.capturedById === actor.userId &&
    !row.supplierReceivingId &&
    !row.supplierTransactionId &&
    now.getTime() - row.capturedAt.getTime() < EMPLOYEE_DELETE_WINDOW_MS
  );
}

/**
 * Soft-delete one page, or the whole bill. The row keeps who deleted it, when
 * and why, so every delete stays on record; the photo file is kept too.
 */
export async function deleteBill(
  id: string,
  options: { wholeBill: boolean; reason?: string },
  actor: BillActor,
  scope: BranchScope
) {
  writeBranch(scope);
  const row = await scopedBill(id, scope);
  if (!canDeleteBill(row, actor))
    throw new AppError(
      'You can delete only your own unlinked bill within 24 hours. Ask an admin to delete this one.',
      403,
      'FORBIDDEN'
    );
  const where = options.wholeBill ? groupWhere(row) : { id: row.id };
  const result = await prisma.supplierReceivingReceipt.updateMany({
    where,
    data: {
      deletedAt: new Date(),
      deletedById: actor.userId,
      deleteReason: options.reason ?? null,
    },
  });
  return { deleted: result.count };
}
