import { randomUUID } from 'node:crypto';
import {
  Prisma, Role, StockMovementType, SupplierReceivingAuditAction,
  SupplierReceivingItemStatus, SupplierReceivingStatus, SupplierTransactionStatus,
} from '@prisma/client';
import { verifyAdminPassword } from '../../../lib/admin-verification';
import { AppError, AuthorizationError, NotFoundError, ValidationError } from '../../../lib/errors';
import {
  businessDateToPrisma, compareBusinessDates, getBusinessTimezone, prismaDateToBusinessDate,
  timestampToBusinessDate, todayInBusinessTimezone,
} from '../../financial/domain/business-date';
import { runFinancialTransaction } from '../../financial/infrastructure/transaction';
import { InventoryRepository } from '../inventory.repository';
import { INVENTORY_QUANTITY_LIMIT, InventoryRequestContext, InventoryUser } from '../inventory.types';
import { normalizeOptionalText } from '../inventory.validator';
import { SupplierReceivingsRepository } from './supplier-receivings.repository';
import {
  CreateSupplierReceivingInput, SupplierReceivingDuplicateInput, SupplierReceivingListInput,
  UpdateSupplierReceivingMetadataInput, VoidSupplierReceivingInput,
} from './supplier-receivings.validator';

const MAX_DATABASE_QUANTITY = 2_147_483_647;
const ONBOARDING_ERROR = 'This product needs a verified opening count before stock actions / يحتاج هذا المنتج جردًا مؤكدًا قبل حركات المخزون';
const BEFORE_OPENING_ERROR = 'This receiving date is before the verified opening count for this product; its stock is already included in that count. / تاريخ الاستلام يسبق الجرد الافتتاحي المؤكد لهذا المنتج، ومخزونه محتسب ضمن ذلك الجرد.';
const STOCK_CHANGED_ERROR = 'Stock changed while receiving. Refresh and try again. / تغيّر المخزون أثناء الاستلام. حدّث الصفحة وحاول مجددًا.';
const ALREADY_VOIDED_ERROR = 'This receiving document is already voided / هذا المستند ملغى بالفعل';
const VOIDED_EDIT_ERROR = 'A voided receiving document cannot be edited / لا يمكن تعديل مستند إدخال ملغى';
const LINKED_DEBT_ERROR = 'This receiving is linked to an active supplier debt. Remove that debt in the supplier ledger first, then void this document. / هذا المستند مرتبط بدين مورد نشط. احذف الدين من سجل المورد أولًا ثم ألغِ المستند.';
const TRACKING_DISABLED_ERROR = 'Stock tracking was turned off for a product on this document, so its stock cannot be reversed / تم إيقاف تتبع المخزون لأحد منتجات هذا المستند، فتعذّر عكس مخزونه';

export interface ReceivingSupplier { id: string; name: string; isActive: boolean }
export interface PostReceivingInput {
  supplier: ReceivingSupplier | null;
  referenceNumber: string | null;
  note: string | null;
  /** Business date, already validated as not in the future. */
  receivedOn: string;
  items: Array<{ productId: string; quantity: number }>;
  userId: string;
}

/**
 * The one and only writer of received stock.
 *
 * Runs inside a caller-supplied transaction so a composite command — a supplier
 * purchase that posts a debt and receives goods — commits both halves together
 * or neither. Both the standalone receiving route and the purchase orchestrator
 * enter here; there is deliberately no second copy of this logic to drift.
 *
 * Returns the created item id per product so the caller can link its own
 * records to the exact row that moved the stock.
 */
export async function postSupplierReceiving(
  input: PostReceivingInput,
  tx: Prisma.TransactionClient
): Promise<{ receivingId: string; itemIdByProductId: Map<string, string> }> {
  validateLines(input.items);
  if (input.supplier && !input.supplier.isActive) {
    throw new AppError('Archived suppliers cannot receive stock / لا يمكن استلام مخزون من مورد مؤرشف', 409, 'SUPPLIER_ARCHIVED');
  }

  // Sorted by product id so concurrent receivings touching the same products
  // always lock them in the same order and cannot deadlock each other.
  const lines = [...input.items].sort((left, right) => left.productId.localeCompare(right.productId));
  for (const line of lines) await validateProduct(line.productId, line.quantity, input.receivedOn, tx);

  const receiving = await SupplierReceivingsRepository.create({
    supplierId: input.supplier?.id ?? null,
    referenceNumber: input.referenceNumber,
    note: input.note,
    receivedOn: businessDateToPrisma(input.receivedOn),
    receivedById: input.userId,
  }, tx);
  const reason = buildReason(input.supplier?.name ?? null, input.referenceNumber);
  const itemIdByProductId = new Map<string, string>();

  for (const line of lines) {
    const product = await InventoryRepository.findProduct(line.productId, tx);
    if (!product || !product.trackStock) throw new AppError(STOCK_CHANGED_ERROR, 409, 'STOCK_CHANGED');
    const quantityAfter = checkedResult(product.stockQuantity, line.quantity);
    const changed = await InventoryRepository.compareAndSetQuantity(product.id, product.stockQuantity, quantityAfter, tx);
    if (changed.count !== 1) throw new AppError(STOCK_CHANGED_ERROR, 409, 'STOCK_CHANGED');
    const itemId = randomUUID();
    const movement = await InventoryRepository.createMovement({
      productId: product.id,
      movementType: StockMovementType.PURCHASE_RECEIPT,
      quantityChange: line.quantity,
      quantityBefore: product.stockQuantity,
      quantityAfter,
      reason,
      note: input.note,
      referenceType: 'SUPPLIER_RECEIVING_ITEM',
      referenceId: itemId,
      createdById: input.userId,
    }, tx);
    await SupplierReceivingsRepository.createItem({ id: itemId, receivingId: receiving.id, productId: product.id, quantity: line.quantity, stockMovementId: movement.id }, tx);
    itemIdByProductId.set(product.id, itemId);
  }

  return { receivingId: receiving.id, itemIdByProductId };
}

/** Rejects a receiving date the business has not reached yet. */
export function assertReceivingDateNotFuture(receivedOn: string): void {
  if (compareBusinessDates(receivedOn, todayInBusinessTimezone()) > 0) {
    throw new ValidationError('Receiving date cannot be in the future / لا يمكن أن يكون تاريخ الاستلام في المستقبل');
  }
}

export class SupplierReceivingsService {
  static async create(input: CreateSupplierReceivingInput, user: InventoryUser) {
    assertRole(user);
    const supplierId = input.supplierId ?? null;
    const referenceNumber = normalizeOptionalText(input.referenceNumber);
    const note = normalizeOptionalText(input.note);
    const receivedOn = input.receivedOn ?? todayInBusinessTimezone();
    assertReceivingDateNotFuture(receivedOn);
    validateLines(input.items);

    return runFinancialTransaction(async (tx) => {
      const supplier = supplierId ? await SupplierReceivingsRepository.findSupplier(supplierId, tx) : null;
      if (supplierId && !supplier) throw new NotFoundError('Supplier not found / المورد غير موجود');

      const { receivingId } = await postSupplierReceiving({
        supplier, referenceNumber, note, receivedOn, items: input.items, userId: user.userId,
      }, tx);

      const result = await SupplierReceivingsRepository.findById(receivingId, tx);
      if (!result) throw new NotFoundError('Receiving not found after creation');
      return serializeReceiving(result);
    });
  }

  static async list(input: SupplierReceivingListInput, user: InventoryUser) {
    assertRole(user);
    const result = await SupplierReceivingsRepository.list(input);
    return { ...result, items: result.items.map(serializeReceiving) };
  }

  static async get(id: string, user: InventoryUser) {
    assertRole(user);
    const receiving = await SupplierReceivingsRepository.findById(id);
    if (!receiving) throw new NotFoundError('Receiving not found / مستند الاستلام غير موجود');
    return serializeReceiving(receiving);
  }

  static async duplicateCheck(input: SupplierReceivingDuplicateInput, user: InventoryUser) {
    assertRole(user);
    const match = await SupplierReceivingsRepository.findDuplicate(input.supplierId, input.referenceNumber.trim());
    return { duplicate: Boolean(match), match: match ? serializeReceiving(match) : null };
  }

  /**
   * Corrects the reference number and note of a posted document — nothing else.
   *
   * These two fields describe the paperwork, not the goods: changing them moves
   * no stock, so no movement is written and no password is asked for. What was
   * received, how much, and on what date stay as posted; correcting those is a
   * void plus a fresh receiving, so history never disagrees with the shelf.
   */
  static async updateMetadata(
    id: string,
    input: UpdateSupplierReceivingMetadataInput,
    user: InventoryUser,
    context: InventoryRequestContext = {}
  ) {
    assertAdmin(user, 'correct receiving documents');
    const referenceNumber = normalizeOptionalText(input.referenceNumber);
    const note = normalizeOptionalText(input.note);
    const reason = input.reason.trim();

    return runFinancialTransaction(async (tx) => {
      const receiving = await SupplierReceivingsRepository.findForCorrection(id, tx);
      if (!receiving) throw new NotFoundError('Receiving not found / مستند الاستلام غير موجود');
      if (receiving.status === SupplierReceivingStatus.VOIDED) throw new AppError(VOIDED_EDIT_ERROR, 409, 'RECEIVING_ALREADY_VOIDED');

      const updated = await SupplierReceivingsRepository.updateMetadata(id, { referenceNumber, note }, tx);
      if (updated.count !== 1) throw new AppError(ALREADY_VOIDED_ERROR, 409, 'RECEIVING_ALREADY_VOIDED');

      await writeReceivingAudit({
        receivingId: id,
        action: SupplierReceivingAuditAction.UPDATE_METADATA,
        reason,
        beforeValues: { referenceNumber: receiving.referenceNumber, note: receiving.note },
        afterValues: { referenceNumber, note },
      }, user, context, tx);

      return loadDetail(id, tx);
    });
  }

  /**
   * Voids a posted receiving by giving back the stock it added.
   *
   * Nothing is deleted. The document, its lines, and its original
   * PURCHASE_RECEIPT movements stay exactly as posted; a second, opposite
   * movement is written beside each one, and the document is marked VOIDED. If
   * any of that stock has already been sold or used, the reversal would drive
   * the count negative — so it is refused, naming the product and the shortfall,
   * rather than quietly leaving a negative shelf.
   */
  static async void(
    id: string,
    input: VoidSupplierReceivingInput,
    user: InventoryUser,
    context: InventoryRequestContext = {}
  ) {
    assertAdmin(user, 'void receiving documents');
    const reason = input.reason.trim();

    return runFinancialTransaction(async (tx) => {
      const receiving = await SupplierReceivingsRepository.findForCorrection(id, tx);
      if (!receiving) throw new NotFoundError('Receiving not found / مستند الاستلام غير موجود');
      if (receiving.status === SupplierReceivingStatus.VOIDED) throw new AppError(ALREADY_VOIDED_ERROR, 409, 'RECEIVING_ALREADY_VOIDED');

      // The supplier ledger is not this service's to change. If money is still
      // posted against this delivery, the admin removes that debt through the
      // supplier ledger's own audited path first.
      const linkedDebt = receiving.transactions[0];
      if (linkedDebt && linkedDebt.status === SupplierTransactionStatus.ACTIVE) {
        throw new AppError(LINKED_DEBT_ERROR, 409, 'RECEIVING_HAS_ACTIVE_DEBT');
      }

      await verifyAdminPassword(user.userId, input.accountPassword, {
        action: 'VOID_SUPPLIER_RECEIVING',
        recordType: 'SUPPLIER_RECEIVING',
        recordId: id,
        ipAddress: context.ipAddress,
        domainLabel: 'inventory stock changes',
      }, tx);

      // Already ordered by product id, so concurrent reversals touching the same
      // products lock them in the same order and cannot deadlock each other.
      const items = receiving.items.filter((item) => item.status === SupplierReceivingItemStatus.ACTIVE);

      // Check every line before touching any of them, so the admin sees the full
      // list of what has already been sold instead of one product at a time.
      const shortfalls: string[] = [];
      for (const item of items) {
        const product = await InventoryRepository.findProduct(item.productId, tx);
        if (!product) throw new NotFoundError('Product not found / المنتج غير موجود');
        if (!product.trackStock) throw new AppError(TRACKING_DISABLED_ERROR, 409, 'STOCK_TRACKING_DISABLED');
        if (product.stockQuantity - item.quantity < 0) {
          shortfalls.push(`${product.name} (${product.sku}): ${item.quantity} received, ${product.stockQuantity} in stock`);
        }
      }
      if (shortfalls.length) {
        throw new AppError(
          `Cannot void because some of this stock has already been sold or used / لا يمكن الإلغاء لأن جزءًا من هذا المخزون تم بيعه أو استخدامه — ${shortfalls.join('; ')}`,
          409,
          'REVERSAL_WOULD_GO_NEGATIVE'
        );
      }

      const reversalReason = buildReversalReason(receiving.supplier?.name ?? null, receiving.referenceNumber, reason);
      const reversedAt = new Date();
      const reversals: Array<{ itemId: string; productId: string; quantity: number; quantityBefore: number; quantityAfter: number; originalMovementId: string; reversalMovementId: string }> = [];

      for (const item of items) {
        const product = await InventoryRepository.findProduct(item.productId, tx);
        if (!product || !product.trackStock) throw new AppError(STOCK_CHANGED_ERROR, 409, 'STOCK_CHANGED');
        const quantityBefore = product.stockQuantity;
        const quantityAfter = quantityBefore - item.quantity;
        if (quantityAfter < 0) throw new AppError(STOCK_CHANGED_ERROR, 409, 'STOCK_CHANGED');
        const changed = await InventoryRepository.compareAndSetQuantity(product.id, quantityBefore, quantityAfter, tx);
        if (changed.count !== 1) throw new AppError(STOCK_CHANGED_ERROR, 409, 'STOCK_CHANGED');

        const movement = await InventoryRepository.createMovement({
          productId: product.id,
          movementType: StockMovementType.PURCHASE_RECEIPT_REVERSAL,
          quantityChange: -item.quantity,
          quantityBefore,
          quantityAfter,
          reason: reversalReason,
          note: null,
          referenceType: 'SUPPLIER_RECEIVING_ITEM',
          referenceId: item.id,
          createdById: user.userId,
        }, tx);
        const reversed = await SupplierReceivingsRepository.reverseItem(item.id, {
          reversalStockMovementId: movement.id, reversedAt, reversedById: user.userId, reversalReason: reason,
        }, tx);
        if (reversed.count !== 1) throw new AppError(ALREADY_VOIDED_ERROR, 409, 'RECEIVING_ALREADY_VOIDED');

        reversals.push({
          itemId: item.id, productId: product.id, quantity: item.quantity,
          quantityBefore, quantityAfter,
          originalMovementId: item.stockMovementId, reversalMovementId: movement.id,
        });
      }

      const voided = await SupplierReceivingsRepository.markVoided(id, { voidedAt: reversedAt, voidedById: user.userId, voidReason: reason }, tx);
      if (voided.count !== 1) throw new AppError(ALREADY_VOIDED_ERROR, 409, 'RECEIVING_ALREADY_VOIDED');

      await writeReceivingAudit({
        receivingId: id,
        action: SupplierReceivingAuditAction.VOID,
        reason,
        beforeValues: { status: SupplierReceivingStatus.POSTED },
        afterValues: { status: SupplierReceivingStatus.VOIDED, reversals },
      }, user, context, tx);

      return loadDetail(id, tx);
    });
  }
}

function assertRole(user: InventoryUser): void {
  if (!user?.userId || ![Role.ADMIN, Role.EMPLOYEE].includes(user.role as Role)) throw new AuthorizationError('You do not have permission to receive stock');
}

/** Employees receive stock; only an admin corrects a document that already posted. */
function assertAdmin(user: InventoryUser, capability: string): void {
  if (!user?.userId) throw new AuthorizationError('User not authenticated');
  if (user.role !== Role.ADMIN) throw new AuthorizationError(`Only administrators can ${capability}`);
}

async function loadDetail(id: string, tx: Prisma.TransactionClient) {
  const result = await SupplierReceivingsRepository.findById(id, tx);
  if (!result) throw new NotFoundError('Receiving not found / مستند الاستلام غير موجود');
  return serializeReceiving(result);
}

async function writeReceivingAudit(
  entry: {
    receivingId: string;
    action: SupplierReceivingAuditAction;
    reason: string;
    beforeValues: Prisma.InputJsonObject;
    afterValues: Prisma.InputJsonObject;
  },
  user: InventoryUser,
  context: InventoryRequestContext,
  tx: Prisma.TransactionClient
): Promise<void> {
  const actor = await SupplierReceivingsRepository.findActor(user.userId, tx);
  if (!actor) throw new NotFoundError('User not found');
  await SupplierReceivingsRepository.createAudit({
    receivingId: entry.receivingId,
    action: entry.action,
    changedById: user.userId,
    changedByName: actor.fullName,
    changedByUsername: actor.username,
    reason: entry.reason,
    beforeValues: entry.beforeValues,
    afterValues: entry.afterValues,
    requestId: context.requestId ?? null,
    ipAddress: context.ipAddress ?? null,
  }, tx);
}

function validateLines(lines: CreateSupplierReceivingInput['items']): void {
  if (!Array.isArray(lines) || lines.length === 0) throw new ValidationError('At least one receiving item is required');
  const seen = new Set<string>();
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > INVENTORY_QUANTITY_LIMIT) throw new ValidationError(`Quantity must be a whole number from 1 to ${INVENTORY_QUANTITY_LIMIT.toLocaleString('en-US')}`);
    if (seen.has(line.productId)) throw new ValidationError('Each product may appear only once in a receiving');
    seen.add(line.productId);
  }
}

async function validateProduct(productId: string, quantity: number, receivedOn: string, tx: Prisma.TransactionClient): Promise<void> {
  const product = await InventoryRepository.findProduct(productId, tx);
  if (!product) throw new NotFoundError('Product not found / المنتج غير موجود');
  if (!product.trackStock) throw new ValidationError('Stock tracking is disabled for this product / تتبع المخزون غير مفعّل لهذا المنتج');
  const opening = await InventoryRepository.findOpeningBalance(productId, tx);
  if (!opening) throw new ValidationError(ONBOARDING_ERROR);
  const openingDate = timestampToBusinessDate(getBusinessTimezone(), opening.createdAt);
  if (compareBusinessDates(receivedOn, openingDate) < 0) throw new ValidationError(BEFORE_OPENING_ERROR);
  checkedResult(product.stockQuantity, quantity);
}

function checkedResult(before: number, change: number): number {
  const after = before + change;
  if (!Number.isSafeInteger(after) || after > MAX_DATABASE_QUANTITY) throw new ValidationError(`Receiving would exceed the maximum supported stock quantity for this product (${MAX_DATABASE_QUANTITY.toLocaleString('en-US')})`);
  return after;
}

function buildReason(supplierName: string | null, referenceNumber: string | null): string {
  const details = [supplierName ? `Supplier: ${supplierName}` : null, referenceNumber ? `Reference: ${referenceNumber}` : null].filter(Boolean);
  return `Stock received / إدخال مخزون${details.length ? ` — ${details.join(' — ')}` : ''}`;
}

function buildReversalReason(supplierName: string | null, referenceNumber: string | null, reason: string): string {
  const details = [supplierName ? `Supplier: ${supplierName}` : null, referenceNumber ? `Reference: ${referenceNumber}` : null].filter(Boolean);
  return `Receiving voided / إلغاء إدخال مخزون${details.length ? ` — ${details.join(' — ')}` : ''} — ${reason}`;
}

function serializeReceiving<T extends { receivedOn: Date }>(receiving: T) {
  return { ...receiving, receivedOn: prismaDateToBusinessDate(receiving.receivedOn) };
}
