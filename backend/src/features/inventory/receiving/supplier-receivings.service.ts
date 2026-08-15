import { randomUUID } from 'node:crypto';
import { Prisma, Role, StockMovementType } from '@prisma/client';
import { AppError, AuthorizationError, NotFoundError, ValidationError } from '../../../lib/errors';
import {
  businessDateToPrisma, compareBusinessDates, getBusinessTimezone, prismaDateToBusinessDate,
  timestampToBusinessDate, todayInBusinessTimezone,
} from '../../financial/domain/business-date';
import { runFinancialTransaction } from '../../financial/infrastructure/transaction';
import { InventoryRepository } from '../inventory.repository';
import { INVENTORY_QUANTITY_LIMIT, InventoryUser } from '../inventory.types';
import { normalizeOptionalText } from '../inventory.validator';
import { SupplierReceivingsRepository } from './supplier-receivings.repository';
import { CreateSupplierReceivingInput, SupplierReceivingDuplicateInput, SupplierReceivingListInput } from './supplier-receivings.validator';

const MAX_DATABASE_QUANTITY = 2_147_483_647;
const ONBOARDING_ERROR = 'This product needs a verified opening count before stock actions / يحتاج هذا المنتج جردًا مؤكدًا قبل حركات المخزون';
const BEFORE_OPENING_ERROR = 'This receiving date is before the verified opening count for this product; its stock is already included in that count. / تاريخ الاستلام يسبق الجرد الافتتاحي المؤكد لهذا المنتج، ومخزونه محتسب ضمن ذلك الجرد.';
const STOCK_CHANGED_ERROR = 'Stock changed while receiving. Refresh and try again. / تغيّر المخزون أثناء الاستلام. حدّث الصفحة وحاول مجددًا.';

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
}

function assertRole(user: InventoryUser): void {
  if (!user?.userId || ![Role.ADMIN, Role.EMPLOYEE].includes(user.role as Role)) throw new AuthorizationError('You do not have permission to receive stock');
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

function serializeReceiving<T extends { receivedOn: Date }>(receiving: T) {
  return { ...receiving, receivedOn: prismaDateToBusinessDate(receiving.receivedOn) };
}
